import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Property } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { formatPropertyAddress } from './address.util';

const ADDRESS_COMPONENTS = [
  'city',
  'street',
  'house',
  'building',
  'floor',
  'apartment',
] as const;

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  create(ownerId: string, dto: CreatePropertyDto): Promise<Property> {
    const address = formatPropertyAddress(dto);
    if (!address) {
      throw new Error('Нарушен инвариант структурированного адреса');
    }
    return this.prisma.property.create({
      data: {
        ownerId,
        city: dto.city,
        street: dto.street,
        house: dto.house,
        building: dto.building,
        floor: dto.floor,
        apartment: dto.apartment,
        cadastralNumber: dto.cadastralNumber,
        address,
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
      orderBy: [
        { city: 'asc' },
        { street: 'asc' },
        { house: 'asc' },
        { createdAt: 'desc' },
      ],
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
    const current = await this.findOneForOwner(ownerId, id);
    const addressTouched = ADDRESS_COMPONENTS.some((field) =>
      Object.prototype.hasOwnProperty.call(dto, field),
    );

    if (!addressTouched) {
      return this.prisma.property.update({
        where: { id },
        data: dto,
      });
    }

    // Важно проверять состояние после слияния: частичная правка допустима у
    // уже структурированного объекта, но не должна частично мигрировать legacy.
    const addressState = Object.fromEntries(
      ADDRESS_COMPONENTS.map((field) => [
        field,
        dto[field] !== undefined ? dto[field] : current[field],
      ]),
    );
    const address = formatPropertyAddress(addressState);
    if (!address) {
      throw new BadRequestException('Укажите город, улицу и дом целиком');
    }

    return this.prisma.property.update({
      where: { id },
      data: { ...dto, address },
    });
  }
}
