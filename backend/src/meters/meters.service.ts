import { Injectable, NotFoundException } from '@nestjs/common';
import { BillStage, LeaseStatus, Meter } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';
import { LeasesService } from '../leases/leases.service';
import {
  calendarDaysUntil,
  computePeriod,
  computeReadingsDueDate,
  computeReadingsStatus,
  ReadingsStatus,
  toNumber,
} from '../billing/billing.util';
import { BillingService } from '../billing/billing.service';
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
    private readonly billing: BillingService,
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
  // Добавляет currentPeriodSubmitted — закрыта ли обязанность строкой
  // расхода в открытом счёте; границы счёта отдаются вместе со списком,
  // чтобы фронтенд и планировщик не расходились (ADR-0024).
  async findAllForLease(
    userId: string,
    leaseId: string,
  ): Promise<{
    periodStart: Date;
    periodEnd: Date;
    readingsDueDate: Date;
    readingsDaysLeft: number;
    meters: (MeterListItem & {
      currentPeriodSubmitted: boolean;
      readingsStatus: ReadingsStatus;
    })[];
  }> {
    const lease = await this.leases.getForUser(userId, leaseId);
    const now = new Date();
    if (lease.status === LeaseStatus.active) {
      await this.billing.ensureCurrentDraft(lease);
    }
    const draft = await this.prisma.bill.findFirst({
      where: { leaseId, stage: BillStage.draft },
      orderBy: { periodStart: 'asc' },
      select: { id: true, periodStart: true, periodEnd: true },
    });
    if (lease.status === LeaseStatus.active && !draft) {
      throw new NotFoundException('Черновик счёта не найден');
    }
    const period = draft ?? computePeriod(now, lease.paymentDay);
    const { periodStart, periodEnd } = period;
    const readingsDueDate = computeReadingsDueDate(periodEnd);
    const readingsDaysLeft = calendarDaysUntil(readingsDueDate, now);
    const meters = await this.prisma.meter.findMany({
      where: { propertyId: lease.propertyId },
      orderBy: { createdAt: 'desc' },
      include: {
        readings: {
          ...(lease.status === LeaseStatus.active
            ? {}
            : { where: { leaseId: lease.id } }),
          orderBy: { readingDate: 'desc' },
          take: 1,
        },
      },
    });
    const pendingIds = new Set(
      draft && lease.status === LeaseStatus.active
        ? (
            await this.billing.metersPendingForBill({
              id: draft.id,
              propertyId: lease.propertyId,
            })
          ).map((meter) => meter.id)
        : [],
    );
    const withStatus = meters.map(({ readings, ...meter }) => {
      const readingsStatus = computeReadingsStatus({
        meterActive: meter.isActive,
        leaseActive: lease.status === LeaseStatus.active,
        submitted: !pendingIds.has(meter.id),
        readingsDueDate,
        now,
      });
      return {
        ...meter,
        lastReadingValue: readings.length
          ? toNumber(readings[0].value)
          : toNumber(meter.initialReading),
        currentPeriodSubmitted: readingsStatus === 'submitted',
        readingsStatus,
      };
    });
    return {
      periodStart,
      periodEnd,
      readingsDueDate,
      readingsDaysLeft,
      meters: withStatus,
    };
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
