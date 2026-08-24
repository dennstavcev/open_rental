import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillStage, LeaseStatus, Property } from '@prisma/client';
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

export interface LeasePaymentHistory {
  finalBills: number;
  paidOnTime: number;
  paidLate: number;
  unpaid: number;
}

export interface PropertyLeaseHistoryEntry {
  leaseId: string;
  startDate: Date;
  endDate: Date;
  effectiveEndDate: Date | null;
  tenantEmail: string | null;
  monthlyRent: number;
  payments: LeasePaymentHistory;
}

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

  async getLeaseHistory(
    ownerId: string,
    propertyId: string,
  ): Promise<PropertyLeaseHistoryEntry[]> {
    // Одинаковый 404 для отсутствующего и чужого объекта: история арендаторов
    // не должна раскрывать даже факт существования чужой карточки.
    await this.findOneForOwner(ownerId, propertyId);

    const leases = await this.prisma.lease.findMany({
      where: {
        propertyId,
        landlordId: ownerId,
        status: LeaseStatus.terminated,
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        effectiveEndDate: true,
        rentAmount: true,
        tenant: { select: { email: true } },
        bills: {
          where: { stage: BillStage.final },
          select: {
            dueDate: true,
            payment: { select: { confirmedAt: true } },
          },
        },
      },
    });

    return leases
      .map((lease) => {
        const payments = lease.bills.reduce<LeasePaymentHistory>(
          (summary, bill) => {
            summary.finalBills += 1;
            if (!bill.payment) {
              summary.unpaid += 1;
            } else if (
              bill.payment.confirmedAt.getTime() <= bill.dueDate.getTime()
            ) {
              summary.paidOnTime += 1;
            } else {
              summary.paidLate += 1;
            }
            return summary;
          },
          { finalBills: 0, paidOnTime: 0, paidLate: 0, unpaid: 0 },
        );

        return {
          leaseId: lease.id,
          startDate: lease.startDate,
          endDate: lease.endDate,
          effectiveEndDate: lease.effectiveEndDate,
          tenantEmail: lease.tenant?.email ?? null,
          monthlyRent: Number(lease.rentAmount),
          payments,
        };
      })
      .sort((a, b) => {
        const ended =
          (b.effectiveEndDate ?? b.endDate).getTime() -
          (a.effectiveEndDate ?? a.endDate).getTime();
        if (ended !== 0) return ended;
        const started = b.startDate.getTime() - a.startDate.getTime();
        return started !== 0 ? started : a.leaseId.localeCompare(b.leaseId);
      });
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
