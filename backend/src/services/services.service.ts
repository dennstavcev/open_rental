import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Service } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
  ) {}

  async create(
    ownerId: string,
    propertyId: string,
    dto: CreateServiceDto,
  ): Promise<Service> {
    // Бросит 404, если объект не принадлежит владельцу.
    await this.properties.findOneForOwner(ownerId, propertyId);
    return this.prisma.service.create({
      data: {
        propertyId,
        name: dto.name,
        price: dto.price,
        serviceType: dto.serviceType,
        description: dto.description,
      },
    });
  }

  async findAll(ownerId: string, propertyId: string): Promise<Service[]> {
    await this.properties.findOneForOwner(ownerId, propertyId);
    return this.prisma.service.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    ownerId: string,
    propertyId: string,
    id: string,
    dto: UpdateServiceDto,
  ): Promise<Service> {
    const service = await this.ensureOwned(ownerId, propertyId, id);
    if (service.sourceRequestId !== null) {
      throw new ConflictException(
        'Услуга создана по согласованной заявке и не редактируется',
      );
    }
    return this.prisma.service.update({ where: { id }, data: dto });
  }

  async remove(
    ownerId: string,
    propertyId: string,
    id: string,
  ): Promise<void> {
    const service = await this.ensureOwned(ownerId, propertyId, id);
    if (service.sourceRequestId !== null) {
      throw new ConflictException(
        'Услуга создана по согласованной заявке и не редактируется',
      );
    }
    await this.prisma.service.delete({ where: { id } });
  }

  // Проверяет, что услуга существует и принадлежит объекту владельца.
  private async ensureOwned(
    ownerId: string,
    propertyId: string,
    id: string,
  ): Promise<Service> {
    await this.properties.findOneForOwner(ownerId, propertyId);
    const service = await this.prisma.service.findFirst({
      where: { id, propertyId },
    });
    if (!service) {
      throw new NotFoundException('Услуга не найдена');
    }
    return service;
  }
}
