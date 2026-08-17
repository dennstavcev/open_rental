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

const ALLOWED_PHOTO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export interface ReadingPhoto {
  buffer: Buffer;
  mimetype: string;
}

export interface ReadingResult {
  reading: MeterReading;
  consumption: number;
  cost: number;
  // Мягкое предупреждение (расход > 10× среднего) — не блокирует сохранение.
  warning: string | null;
}

@Injectable()
export class MeterReadingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(METER_OCR_PROVIDER) private readonly ocr: MeterOcrProvider,
    private readonly billing: BillingService,
  ) {}

  async create(
    userId: string,
    meterId: string,
    confirmedValue: number,
    photo: ReadingPhoto,
    readingDate?: string,
  ): Promise<ReadingResult> {
    const ext = ALLOWED_PHOTO[photo.mimetype];
    if (!ext) {
      throw new BadRequestException('Фото должно быть JPEG или PNG');
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

    // OCR только подсказывает; сохраняем то, что вернул движок (в MVP замокан).
    const ocrValue = await this.ocr.recognize(photo.buffer);

    const storageKey = `meters/${meterId}/reading-${randomUUID()}.${ext}`;
    await this.storage.put(storageKey, photo.buffer, photo.mimetype);

    const reading = await this.prisma.meterReading.create({
      data: {
        meterId,
        leaseId: lease.id,
        value: confirmedValue,
        ocrValue: ocrValue ?? undefined,
        photoStorageKey: storageKey,
        enteredById: userId,
        ...(readingDate ? { readingDate: new Date(readingDate) } : {}),
      },
    });

    const cost = round2(consumption * toNumber(meter.tariff));
    await this.billing.addUtilityLine(lease, {
      title: `${meter.name}: расход ${consumption} × ${toNumber(meter.tariff)}`,
      amount: cost,
      sourceRefId: reading.id,
    });

    return { reading, consumption, cost, warning };
  }

  // История показаний счётчика (ADR-0015) — доступна landlord/tenant
  // текущего активного договора объекта; scoped на этот договор (не
  // «протекает» история прошлых арендаторов того же объекта).
  async listForMeter(
    userId: string,
    meterId: string,
  ): Promise<MeterReading[]> {
    const meter = await this.prisma.meter.findUnique({
      where: { id: meterId },
    });
    if (!meter) {
      throw new NotFoundException('Счётчик не найден');
    }
    const lease = await this.prisma.lease.findFirst({
      where: { propertyId: meter.propertyId, status: LeaseStatus.active },
    });
    if (!lease || (lease.landlordId !== userId && lease.tenantId !== userId)) {
      throw new NotFoundException('Счётчик не найден');
    }
    return this.prisma.meterReading.findMany({
      where: { meterId, leaseId: lease.id },
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
