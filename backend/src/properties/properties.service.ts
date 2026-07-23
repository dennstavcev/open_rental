import { Injectable, NotFoundException } from '@nestjs/common';
import { Property } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  create(ownerId: string, dto: CreatePropertyDto): Promise<Property> {
    return this.prisma.property.create({
      data: {
        ownerId,
        address: dto.address,
        propertyType: dto.propertyType,
        areaSqm: dto.areaSqm,
        description: dto.description,
        // timezone опущен → сработает дефолт БД (Europe/Moscow).
        ...(dto.timezone ? { timezone: dto.timezone } : {}),
      },
    });
  }

  findAllForOwner(ownerId: string): Promise<Property[]> {
    return this.prisma.property.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneForOwner(ownerId: string, id: string): Promise<Property> {
    const property = await this.prisma.property.findFirst({
      where: { id, ownerId },
    });
    if (!property) {
      throw new NotFoundException('Объект не найден');
    }
    return property;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdatePropertyDto,
  ): Promise<Property> {
    // Проверяем владение до апдейта — чужой объект не находится → 404.
    await this.findOneForOwner(ownerId, id);
    return this.prisma.property.update({
      where: { id },
      data: dto,
    });
  }
}
