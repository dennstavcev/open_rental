import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryReturnStatus,
  Lease,
  LeaseStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationsService,
  NotifyInput,
} from '../notifications/notifications.service';
import { LeasesService } from './leases.service';

const MAX_MONEY = new Prisma.Decimal('9999999999.99');

@Injectable()
export class LeaseReturnActService {
  private readonly logger = new Logger(LeaseReturnActService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: LeasesService,
    private readonly notifications: NotificationsService,
  ) {}

  async submit(landlordId: string, leaseId: string): Promise<Lease> {
    await this.leases.getOwnedTerminated(landlordId, leaseId);

    const submitted = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM leases WHERE id = ${leaseId} FOR UPDATE`;

      const lease = await tx.lease.findUnique({ where: { id: leaseId } });
      if (!lease || lease.landlordId !== landlordId) {
        throw new NotFoundException('Договор не найден');
      }
      if (lease.status !== LeaseStatus.terminated) {
        throw new ConflictException(
          'Состояние имущества фиксируется после расторжения договора',
        );
      }
      if (lease.returnActConfirmedAt) {
        throw new ConflictException('Акт возврата уже подтверждён');
      }
      if (lease.returnActSubmittedAt) {
        return false;
      }

      const items = await tx.leaseInventoryItem.findMany({
        where: { leaseId },
      });
      if (items.some((item) => item.returnStatus === null)) {
        throw new ConflictException(
          'Заполните состояние всех позиций описи',
        );
      }
      await tx.lease.update({
        where: { id: leaseId },
        data: { returnActSubmittedAt: new Date() },
      });
      return true;
    });

    const lease = await this.leases.getForUser(landlordId, leaseId);
    if (submitted && lease.tenantId) {
      await this.notifyBestEffort(lease.tenantId, {
        type: 'return_act_submitted',
        title: 'Акт возврата имущества готов',
        body: `Собственник зафиксировал состояние имущества по объекту «${lease.property.address}». Проверьте и подтвердите — от этого зависит сумма возврата депозита.`,
      });
    }
    return lease;
  }

  async confirm(tenantId: string, leaseId: string): Promise<Lease> {
    const visibleLease = await this.leases.getForUser(tenantId, leaseId);
    if (visibleLease.tenantId !== tenantId) {
      throw new NotFoundException('Договор не найден');
    }
    if (visibleLease.status !== LeaseStatus.terminated) {
      throw new ConflictException(
        'Акт возврата подтверждается после расторжения договора',
      );
    }

    const confirmation = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM leases WHERE id = ${leaseId} FOR UPDATE`;

      const lease = await tx.lease.findUnique({ where: { id: leaseId } });
      if (!lease || lease.tenantId !== tenantId) {
        throw new NotFoundException('Договор не найден');
      }
      if (lease.status !== LeaseStatus.terminated) {
        throw new ConflictException(
          'Акт возврата подтверждается после расторжения договора',
        );
      }
      if (!lease.returnActSubmittedAt) {
        throw new ConflictException(
          'Собственник ещё не отправил акт на подтверждение',
        );
      }
      if (lease.returnActConfirmedAt) {
        return { changed: false, depositReturn: null };
      }

      const items = await tx.leaseInventoryItem.findMany({
        where: { leaseId },
      });
      const totalDamage = items.reduce((total, item) => {
        if (
          (item.returnStatus === InventoryReturnStatus.damaged ||
            item.returnStatus === InventoryReturnStatus.missing) &&
          item.damageAmount !== null
        ) {
          return total.plus(item.damageAmount);
        }
        return total;
      }, new Prisma.Decimal(0));
      if (totalDamage.greaterThan(MAX_MONEY)) {
        throw new BadRequestException('Суммарный ущерб слишком велик');
      }

      const current = new Prisma.Decimal(lease.depositReturnAmount ?? 0);
      const applied = current.lessThan(totalDamage) ? current : totalDamage;
      const newReturn = current.minus(applied);
      const uncovered = totalDamage.minus(applied);

      await tx.lease.update({
        where: { id: leaseId },
        data: {
          returnActConfirmedAt: new Date(),
          depositReturnAmount: newReturn,
          returnActDamageTotal: totalDamage,
          returnActDepositReturn: newReturn,
          returnActUncovered: uncovered,
          returnActUncoveredRemaining: uncovered,
        },
      });
      return { changed: true, depositReturn: newReturn };
    });

    const lease = await this.leases.getForUser(tenantId, leaseId);
    if (confirmation.changed && confirmation.depositReturn) {
      await this.notifyBestEffort(lease.landlordId, {
        type: 'return_act_confirmed',
        title: 'Акт возврата подтверждён',
        body: `Арендатор подтвердил акт по объекту «${lease.property.address}». Возврат депозита — ${confirmation.depositReturn.toFixed(2)} ₽.`,
      });
    }
    return lease;
  }

  private async notifyBestEffort(
    userId: string,
    input: NotifyInput,
  ): Promise<void> {
    try {
      await this.notifications.notify(userId, input);
    } catch (error) {
      this.logger.warn(
        `Не удалось создать уведомление «${input.type}» для ${userId}: ${String(error)}`,
      );
    }
  }
}
