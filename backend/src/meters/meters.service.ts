import { Injectable, NotFoundException } from '@nestjs/common';
import { Meter } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';
import { toNumber } from '../billing/billing.util';
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
    return this.prisma.meter.update({ where: { id }, data: dto });
  }
}
