import { Injectable, NotFoundException } from '@nestjs/common';
import { Meter } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';
import { CreateMeterDto } from './dto/create-meter.dto';
import { UpdateMeterDto } from './dto/update-meter.dto';

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
        tariff: dto.tariff,
      },
    });
  }

  async findAll(ownerId: string, propertyId: string): Promise<Meter[]> {
    await this.properties.findOneForOwner(ownerId, propertyId);
    return this.prisma.meter.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
    });
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
