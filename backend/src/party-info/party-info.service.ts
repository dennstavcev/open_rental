import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Lease,
  LeaseParty,
  LeaseStatus,
  MaintenanceStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { PartyInfoDto } from './dto/party-info.dto';

const RETENTION_YEARS = 3; // Срок исковой давности, ГК РФ ст. 196 (ADR-0021).

@Injectable()
export class PartyInfoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  // Вносит/обновляет свои персональные данные — только сторона договора,
  // и только свою запись (роль определяется по landlordId/tenantId, не по
  // параметру запроса — исключает подмену роли).
  async upsert(
    userId: string,
    leaseId: string,
    dto: PartyInfoDto,
  ): Promise<{ leaseId: string; role: LeaseParty }> {
    const { role } = await this.resolveParty(userId, leaseId);
    const dataEnc = this.crypto.encrypt(JSON.stringify(dto));
    await this.prisma.leasePartyInfo.upsert({
      where: { leaseId_role: { leaseId, role } },
      create: { leaseId, role, enteredById: userId, dataEnc },
      update: { dataEnc, enteredById: userId },
    });
    return { leaseId, role };
  }

  // Читает свою запись (сторона договора).
  async getOwn(userId: string, leaseId: string): Promise<PartyInfoDto> {
    const { role } = await this.resolveParty(userId, leaseId);
    return this.readRole(leaseId, role);
  }

  // Читает запись любой стороны — только SuperAdmin (споры/проверки).
  async getAsSuperAdmin(
    leaseId: string,
    role: LeaseParty,
  ): Promise<PartyInfoDto> {
    return this.readRole(leaseId, role);
  }

  private async readRole(
    leaseId: string,
    role: LeaseParty,
  ): Promise<PartyInfoDto> {
    const info = await this.prisma.leasePartyInfo.findUnique({
      where: { leaseId_role: { leaseId, role } },
    });
    if (!info) {
      throw new NotFoundException('Персональные данные не заполнены');
    }
    return JSON.parse(this.crypto.decrypt(info.dataEnc)) as PartyInfoDto;
  }

  // Ретеншен ПДн (ADR-0021): удаляет LeasePartyInfo для договоров,
  // завершённых более RETENTION_YEARS лет назад. Пауза при активном споре —
  // если по договору есть незакрытая заявка на обслуживание, удаление
  // откладывается до её закрытия.
  async runRetention(now: Date = new Date()): Promise<{ deleted: number }> {
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);

    const candidates = await this.prisma.lease.findMany({
      where: {
        status: LeaseStatus.terminated,
        partyInfo: { some: {} },
      },
      select: {
        id: true,
        endDate: true,
        effectiveEndDate: true,
        maintenanceRequests: {
          where: {
            status: {
              in: [MaintenanceStatus.open, MaintenanceStatus.in_progress],
            },
          },
          select: { id: true },
        },
      },
    });

    let deleted = 0;
    for (const lease of candidates) {
      const endedAt = lease.effectiveEndDate ?? lease.endDate;
      if (endedAt > cutoff || lease.maintenanceRequests.length > 0) {
        continue;
      }
      const { count } = await this.prisma.leasePartyInfo.deleteMany({
        where: { leaseId: lease.id },
      });
      deleted += count;
    }
    return { deleted };
  }

  // Определяет сторону договора для пользователя (или 404, если не сторона)
  // — по образцу LeaseSignedScansService.resolveParty.
  private async resolveParty(
    userId: string,
    leaseId: string,
  ): Promise<{ lease: Lease; role: LeaseParty }> {
    const lease = await this.prisma.lease.findUnique({
      where: { id: leaseId },
    });
    if (!lease) {
      throw new NotFoundException('Договор не найден');
    }
    if (lease.landlordId === userId) {
      return { lease, role: LeaseParty.landlord };
    }
    if (lease.tenantId === userId) {
      return { lease, role: LeaseParty.tenant };
    }
    throw new NotFoundException('Договор не найден');
  }
}
