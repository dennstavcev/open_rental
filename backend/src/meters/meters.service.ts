import { Injectable, NotFoundException } from '@nestjs/common';
import { Meter } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';
import { LeasesService } from '../leases/leases.service';
import { computePeriod, toNumber } from '../billing/billing.util';
import { CreateMeterDto } from './dto/create-meter.dto';
import { UpdateMeterDto } from './dto/update-meter.dto';

// Вычисляемое поле ответа API (не хранится) — последнее показание счётчика
// или initialReading, если показаний ещё не было (ADR-0014). Нужно
// фронтенду для отображения текущего значения и живого пересчёта стоимости
// в форме подачи показания.
export interface MeterListItem extends Meter {
  lastReadingValue: number;
}

@Injectable()
export class MetersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly leases: LeasesService,
  ) {}

  async create(
    ownerId: string,
    propertyId: string,
    dto: CreateMeterDto,
  ): Promise<Meter> {
    await this.properties.findOneForOwner(ownerId, propertyId);
    return this.prisma.meter.create({
      data: {
        propertyId,
        meterType: dto.meterType,
        name: dto.name,
        serialNumber: dto.serialNumber,
        tariff: dto.tariff,
        initialReading: dto.initialReading,
        ...(dto.calibrationDueDate
          ? { calibrationDueDate: new Date(dto.calibrationDueDate) }
          : {}),
      },
    });
  }

  async findAll(
    ownerId: string,
    propertyId: string,
  ): Promise<MeterListItem[]> {
    await this.properties.findOneForOwner(ownerId, propertyId);
    const meters = await this.prisma.meter.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      include: { readings: { orderBy: { readingDate: 'desc' }, take: 1 } },
    });
    return meters.map(({ readings, ...meter }) => ({
      ...meter,
      lastReadingValue: readings.length
        ? toNumber(readings[0].value)
        : toNumber(meter.initialReading),
    }));
  }

  // Список счётчиков для хаба аренды — landlord ИЛИ tenant договора
  // (ADR-0015), в отличие от findAll (landlord-only, карточка объекта).
  // Добавляет currentPeriodSubmitted — подано ли показание в текущем
  // расчётном периоде договора; границы периода отдаются вместе со
  // списком, чтобы фронтенд не дублировал computePeriod.
  async findAllForLease(
    userId: string,
    leaseId: string,
  ): Promise<{
    periodStart: Date;
    periodEnd: Date;
    meters: (MeterListItem & { currentPeriodSubmitted: boolean })[];
  }> {
    const lease = await this.leases.getForUser(userId, leaseId);
    const { periodStart, periodEnd } = computePeriod(
      new Date(),
      lease.paymentDay,
    );
    const meters = await this.prisma.meter.findMany({
      where: { propertyId: lease.propertyId },
      orderBy: { createdAt: 'desc' },
      include: { readings: { orderBy: { readingDate: 'desc' }, take: 1 } },
    });
    const withStatus = await Promise.all(
      meters.map(async ({ readings, ...meter }) => {
        const currentPeriodReading = await this.prisma.meterReading.findFirst(
          {
            where: {
              meterId: meter.id,
              readingDate: { gte: periodStart, lt: periodEnd },
            },
          },
        );
        return {
          ...meter,
          lastReadingValue: readings.length
            ? toNumber(readings[0].value)
            : toNumber(meter.initialReading),
          currentPeriodSubmitted: !!currentPeriodReading,
        };
      }),
    );
    return { periodStart, periodEnd, meters: withStatus };
  }

  async update(
    ownerId: string,
    propertyId: string,
    id: string,
    dto: UpdateMeterDto,
  ): Promise<Meter> {
    await this.properties.findOneForOwner(ownerId, propertyId);
    const meter = await this.prisma.meter.findFirst({
      where: { id, propertyId },
    });
    if (!meter) {
      throw new NotFoundException('Счётчик не найден');
    }
    return this.prisma.meter.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.calibrationDueDate
          ? { calibrationDueDate: new Date(dto.calibrationDueDate) }
          : {}),
      },
    });
  }
}
