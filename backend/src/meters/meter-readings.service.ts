import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeaseStatus, MeterReading } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '../storage/storage-provider.interface';
import {
  METER_OCR_PROVIDER,
  MeterOcrProvider,
} from '../ocr/meter-ocr-provider.interface';
import { BillingService } from '../billing/billing.service';
import { round2, toNumber } from '../billing/billing.util';
import { LeasesService } from '../leases/leases.service';

const ALLOWED_PHOTO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export interface ReadingPhoto {
  buffer: Buffer;
  mimetype: string;
}

export type ReadingResult =
  | {
      requiresConfirmation: true;
      consumption: number;
      cost: number;
      previousValue: number;
      // null — аномалия исчезла после пересчёта, но числа изменились.
      warning: string | null;
    }
  | {
      requiresConfirmation?: false;
      reading: MeterReading;
      consumption: number;
      cost: number;
      warning: string | null;
    };

@Injectable()
export class MeterReadingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(METER_OCR_PROVIDER) private readonly ocr: MeterOcrProvider,
    private readonly billing: BillingService,
    private readonly leases: LeasesService,
  ) {}

  async create(
    userId: string,
    meterId: string,
    confirmedValue: number,
    photo: ReadingPhoto,
    readingDate?: string,
    confirm?: boolean,
    expectedPreviousValue?: number,
  ): Promise<ReadingResult> {
    const ext = ALLOWED_PHOTO[photo.mimetype];
    if (!ext) {
      throw new BadRequestException('Фото должно быть JPEG или PNG');
    }
    const parsedReadingDate = readingDate ? new Date(readingDate) : null;
    if (parsedReadingDate && parsedReadingDate.getTime() > Date.now()) {
      throw new BadRequestException('Дата показания не может быть в будущем');
    }

    const meter = await this.prisma.meter.findUnique({
      where: { id: meterId },
    });
    if (!meter) {
      throw new NotFoundException('Счётчик не найден');
    }
    if (!meter.isActive) {
      throw new ConflictException(
        'Счётчик отключён и не принимает новые показания',
      );
    }

    // Показание попадает в текущий активный договор объекта.
    const lease = await this.prisma.lease.findFirst({
      where: { propertyId: meter.propertyId, status: LeaseStatus.active },
    });
    if (!lease) {
      throw new ConflictException('По объекту нет активного договора');
    }
    if (lease.landlordId !== userId && lease.tenantId !== userId) {
      throw new NotFoundException('Счётчик не найден');
    }
    if (confirm && expectedPreviousValue === undefined) {
      throw new BadRequestException('Подтверждение без исходного значения');
    }

    // Прошлые показания счётчика (для валидации и среднего расхода).
    const prior = await this.prisma.meterReading.findMany({
      where: { meterId },
      orderBy: { readingDate: 'asc' },
    });
    // База отсчёта для первого показания — initialReading, а не 0
    // (ADR-0014): счётчик почти всегда добавляется уже с накопленным
    // значением, расчёт от нуля завышал бы начисление.
    const previousValue = prior.length
      ? toNumber(prior[prior.length - 1].value)
      : toNumber(meter.initialReading);
    if (confirmedValue < previousValue) {
      throw new BadRequestException(
        'Новое показание не может быть меньше предыдущего',
      );
    }
    const consumption = round2(confirmedValue - previousValue);

    const warning = this.consumptionWarning(prior, consumption);
    const cost = round2(consumption * toNumber(meter.tariff));

    if (confirm && expectedPreviousValue !== previousValue) {
      return {
        requiresConfirmation: true,
        consumption,
        cost,
        previousValue,
        warning,
      };
    }

    if (warning && !confirm) {
      return {
        requiresConfirmation: true,
        consumption,
        cost,
        previousValue,
        warning,
      };
    }

    // OCR только подсказывает; сохраняем то, что вернул движок (в MVP замокан).
    const ocrValue = await this.ocr.recognize(photo.buffer);

    const storageKey = `meters/${meterId}/reading-${randomUUID()}.${ext}`;
    await this.storage.put(storageKey, photo.buffer, photo.mimetype);

    await this.billing.ensureCurrentDraft(lease);
    const reading = await this.prisma.$transaction(async (tx) => {
      const created = await tx.meterReading.create({
        data: {
          meterId,
          leaseId: lease.id,
          value: confirmedValue,
          ocrValue: ocrValue ?? undefined,
          photoStorageKey: storageKey,
          enteredById: userId,
          ...(parsedReadingDate ? { readingDate: parsedReadingDate } : {}),
        },
      });
      await this.billing.addUtilityLine(
        lease,
        {
          title: `${meter.name}: расход ${consumption} × ${toNumber(meter.tariff)}`,
          amount: cost,
          sourceRefId: created.id,
        },
        tx,
      );
      return created;
    });

    return { reading, consumption, cost, warning };
  }

  // История показаний доступна сторонам указанного договора и ограничена
  // этим договором независимо от его статуса (ADR-0034).
  async listForLeaseMeter(
    userId: string,
    leaseId: string,
    meterId: string,
  ): Promise<MeterReading[]> {
    const lease = await this.leases.getForUser(userId, leaseId);
    const meter = await this.prisma.meter.findUnique({
      where: { id: meterId },
    });
    if (!meter || meter.propertyId !== lease.propertyId) {
      throw new NotFoundException('Счётчик не найден');
    }
    return this.prisma.meterReading.findMany({
      where: { meterId, leaseId },
      orderBy: { readingDate: 'desc' },
    });
  }

  // Предупреждение, если расход превышает средний по счётчику более чем в 10×.
  private consumptionWarning(
    prior: MeterReading[],
    consumption: number,
  ): string | null {
    if (prior.length < 2) {
      return null;
    }
    const consumptions: number[] = [];
    for (let i = 1; i < prior.length; i++) {
      consumptions.push(
        toNumber(prior[i].value) - toNumber(prior[i - 1].value),
      );
    }
    const avg =
      consumptions.reduce((a, b) => a + b, 0) / consumptions.length;
    if (avg > 0 && consumption > avg * 10) {
      return 'Расход более чем в 10 раз превышает средний — проверьте показания';
    }
    return null;
  }
}
