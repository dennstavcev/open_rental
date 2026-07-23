import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeaseStatus, TerminationRequest, TerminationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from '../leases/leases.service';
import { BillingService } from '../billing/billing.service';
import { CreateTerminationDto } from './dto/create-termination.dto';
import { FinalizeTerminationDto } from './dto/finalize-termination.dto';

const MIN_NOTICE_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class TerminationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: LeasesService,
    private readonly billing: BillingService,
  ) {}

  // Инициировать может любая сторона активного договора (в т.ч. tenant —
  // как способ уведомить). Минимум 30 дней уведомления.
  async create(
    userId: string,
    leaseId: string,
    dto: CreateTerminationDto,
  ): Promise<TerminationRequest> {
    const lease = await this.leases.getForUser(userId, leaseId);
    if (lease.status !== LeaseStatus.active) {
      throw new ConflictException('Расторгнуть можно только активный договор');
    }
    const requested = new Date(dto.requestedTerminationDate);
    if (requested.getTime() < Date.now() + MIN_NOTICE_MS) {
      throw new BadRequestException(
        'Дата расторжения — не ранее чем через 30 дней',
      );
    }
    return this.prisma.terminationRequest.create({
      data: {
        leaseId,
        initiatedById: userId,
        requestedTerminationDate: requested,
        reason: dto.reason,
      },
    });
  }

  async list(userId: string, leaseId: string): Promise<TerminationRequest[]> {
    await this.leases.getForUser(userId, leaseId);
    return this.prisma.terminationRequest.findMany({
      where: { leaseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Финализирует ТОЛЬКО landlord (решение владельца, не двустороннее).
  async finalize(
    userId: string,
    id: string,
    dto: FinalizeTerminationDto,
  ): Promise<TerminationRequest> {
    const request = await this.prisma.terminationRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException('Заявка на расторжение не найдена');
    }
    const lease = await this.prisma.lease.findUnique({
      where: { id: request.leaseId },
    });
    if (!lease || lease.landlordId !== userId) {
      throw new ForbiddenException('Финализировать расторжение может только собственник');
    }
    if (request.status !== TerminationStatus.pending) {
      throw new ConflictException('Заявка уже обработана');
    }

    const override = dto.periodEndOverride
      ? new Date(dto.periodEndOverride)
      : null;
    const effectiveEndDate = override ?? request.requestedTerminationDate;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.lease.update({
        where: { id: lease.id },
        data: {
          status: LeaseStatus.terminated,
          effectiveEndDate,
          ...(dto.depositReturnAmount !== undefined
            ? { depositReturnAmount: dto.depositReturnAmount }
            : {}),
        },
      });
      return tx.terminationRequest.update({
        where: { id },
        data: {
          status: TerminationStatus.finalized,
          finalizedById: userId,
          finalizedAt: new Date(),
          periodEndOverride: override,
        },
      });
    });

    // Пропорциональный последний счёт (вне транзакции — своя логика биллинга).
    await this.billing.applyTermination(lease, effectiveEndDate);
    return updated;
  }
}
