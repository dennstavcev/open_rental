import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryReturnStatus,
  LeaseStatus,
  Prisma,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeaseReturnActService } from './lease-return-act.service';
import { LeasesService } from './leases.service';

const view = {
  id: 'l1',
  landlordId: 'owner1',
  tenantId: 'tenant1',
  status: LeaseStatus.terminated,
  property: { id: 'p1', address: 'г. Иркутск, ул. Ленина, д. 1' },
};

function terminatedLease(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    landlordId: 'owner1',
    tenantId: 'tenant1',
    status: LeaseStatus.terminated,
    returnActSubmittedAt: new Date('2026-08-24T10:00:00Z'),
    returnActConfirmedAt: null,
    depositReturnAmount: new Prisma.Decimal(30_000),
    ...overrides,
  };
}

describe('LeaseReturnActService', () => {
  let service: LeaseReturnActService;
  let prisma: any;
  let leases: {
    getOwnedTerminated: jest.Mock;
    getForUser: jest.Mock;
  };
  let notifications: { notify: jest.Mock };

  beforeEach(() => {
    prisma = {
      lease: {
        findUnique: jest.fn().mockResolvedValue(terminatedLease()),
        update: jest.fn().mockResolvedValue({}),
      },
      leaseInventoryItem: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    leases = {
      getOwnedTerminated: jest.fn().mockResolvedValue(terminatedLease()),
      getForUser: jest.fn().mockResolvedValue(view),
    };
    notifications = { notify: jest.fn().mockResolvedValue({}) };
    service = new LeaseReturnActService(
      prisma as PrismaService,
      leases as unknown as LeasesService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('submit', () => {
    it('не отправляет акт с незаполненной позицией', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        terminatedLease({ returnActSubmittedAt: null }),
      );
      prisma.leaseInventoryItem.findMany.mockResolvedValue([
        { id: 'i1', returnStatus: null },
      ]);

      await expect(service.submit('owner1', 'l1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.lease.update).not.toHaveBeenCalled();
    });

    it('разрешает пустую опись и уведомляет арендатора после транзакции', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        terminatedLease({ returnActSubmittedAt: null }),
      );

      await service.submit('owner1', 'l1');

      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.lease.findUnique.mock.invocationCallOrder[0],
      );
      expect(prisma.lease.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { returnActSubmittedAt: expect.any(Date) },
      });
      expect(notifications.notify).toHaveBeenCalledWith(
        'tenant1',
        expect.objectContaining({ title: 'Акт возврата имущества готов' }),
      );
    });

    it('повторная отправка не переписывает отметку', async () => {
      await service.submit('owner1', 'l1');

      expect(prisma.lease.update).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('до отправки возвращает Conflict', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        terminatedLease({ returnActSubmittedAt: null }),
      );

      await expect(service.confirm('tenant1', 'l1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('не арендатору не раскрывает подтверждение', async () => {
      leases.getForUser.mockResolvedValue(view);

      await expect(service.confirm('owner1', 'l1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('вычитает ущерб из актуального возврата и сохраняет снимок', async () => {
      prisma.leaseInventoryItem.findMany.mockResolvedValue([
        {
          returnStatus: InventoryReturnStatus.damaged,
          damageAmount: new Prisma.Decimal(5000),
        },
      ]);

      await service.confirm('tenant1', 'l1');

      const data = prisma.lease.update.mock.calls[0][0].data;
      expect(data.depositReturnAmount.toString()).toBe('25000');
      expect(data.returnActDamageTotal.toString()).toBe('5000');
      expect(data.returnActDepositReturn.toString()).toBe('25000');
      expect(data.returnActUncovered.toString()).toBe('0');
      expect(data.returnActUncoveredRemaining.toString()).toBe('0');
    });

    it('не опускает возврат ниже нуля и фиксирует непокрытый ущерб', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        terminatedLease({ depositReturnAmount: new Prisma.Decimal(10_000) }),
      );
      prisma.leaseInventoryItem.findMany.mockResolvedValue([
        {
          returnStatus: InventoryReturnStatus.missing,
          damageAmount: new Prisma.Decimal(25_000),
        },
      ]);

      await service.confirm('tenant1', 'l1');

      const data = prisma.lease.update.mock.calls[0][0].data;
      expect(data.depositReturnAmount.toString()).toBe('0');
      expect(data.returnActUncovered.toString()).toBe('15000');
      expect(data.returnActUncoveredRemaining.toString()).toBe('15000');
    });

    it('nullable-возврат считает нулём', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        terminatedLease({ depositReturnAmount: null }),
      );
      prisma.leaseInventoryItem.findMany.mockResolvedValue([
        {
          returnStatus: InventoryReturnStatus.damaged,
          damageAmount: new Prisma.Decimal(5000),
        },
      ]);

      await service.confirm('tenant1', 'l1');

      expect(
        prisma.lease.update.mock.calls[0][0].data.depositReturnAmount.toString(),
      ).toBe('0');
    });

    it('повторное подтверждение не выполняет второй вычет', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        terminatedLease({ returnActConfirmedAt: new Date() }),
      );

      await service.confirm('tenant1', 'l1');

      expect(prisma.leaseInventoryItem.findMany).not.toHaveBeenCalled();
      expect(prisma.lease.update).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('не учитывает ok и пустые суммы', async () => {
      prisma.leaseInventoryItem.findMany.mockResolvedValue([
        {
          returnStatus: InventoryReturnStatus.ok,
          damageAmount: new Prisma.Decimal(999),
        },
        {
          returnStatus: InventoryReturnStatus.damaged,
          damageAmount: null,
        },
      ]);

      await service.confirm('tenant1', 'l1');

      expect(
        prisma.lease.update.mock.calls[0][0].data.returnActDamageTotal.toString(),
      ).toBe('0');
    });

    it('считает от значения, перечитанного под блокировкой после Фазы 6', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        terminatedLease({ depositReturnAmount: new Prisma.Decimal(35_000) }),
      );
      prisma.leaseInventoryItem.findMany.mockResolvedValue([
        {
          returnStatus: InventoryReturnStatus.damaged,
          damageAmount: new Prisma.Decimal(5000),
        },
      ]);

      await service.confirm('tenant1', 'l1');

      expect(
        prisma.lease.update.mock.calls[0][0].data.depositReturnAmount.toString(),
      ).toBe('30000');
    });

    it('складывает копейки без float-дрейфа', async () => {
      prisma.leaseInventoryItem.findMany.mockResolvedValue([
        {
          returnStatus: InventoryReturnStatus.damaged,
          damageAmount: new Prisma.Decimal('0.01'),
        },
        {
          returnStatus: InventoryReturnStatus.missing,
          damageAmount: new Prisma.Decimal('0.02'),
        },
      ]);

      await service.confirm('tenant1', 'l1');

      expect(
        prisma.lease.update.mock.calls[0][0].data.returnActDamageTotal.toFixed(2),
      ).toBe('0.03');
    });

    it('отклоняет итог, который не помещается в денежный снимок', async () => {
      prisma.leaseInventoryItem.findMany.mockResolvedValue([
        {
          returnStatus: InventoryReturnStatus.missing,
          damageAmount: new Prisma.Decimal('10000000000.00'),
        },
      ]);

      await expect(service.confirm('tenant1', 'l1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.lease.update).not.toHaveBeenCalled();
    });

    it('сбой уведомления не откатывает подтверждение', async () => {
      notifications.notify.mockRejectedValue(new Error('channel down'));

      await expect(service.confirm('tenant1', 'l1')).resolves.toEqual(view);
      expect(prisma.lease.update).toHaveBeenCalledTimes(1);
    });
  });
});
