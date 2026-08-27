import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { LeaseStatus, TerminationStatus } from '@prisma/client';
import { TerminationService } from './termination.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from '../leases/leases.service';
import { BillingService } from '../billing/billing.service';
import { NotificationsService } from '../notifications/notifications.service';

const DAY = 24 * 60 * 60 * 1000;
const activeLease = {
  id: 'l1',
  landlordId: 'landlord1',
  tenantId: 'tenant1',
  status: LeaseStatus.active,
};

describe('TerminationService', () => {
  let service: TerminationService;
  let prisma: any;
  let leases: { getForUser: jest.Mock };
  let billing: { applyTermination: jest.Mock };
  let notifications: { notify: jest.Mock };

  beforeEach(() => {
    prisma = {
      terminationRequest: {
        create: jest.fn().mockResolvedValue({ id: 'tr1' }),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'tr1',
          leaseId: 'l1',
          status: TerminationStatus.finalized,
        }),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'tr1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      lease: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    leases = { getForUser: jest.fn().mockResolvedValue(activeLease) };
    billing = { applyTermination: jest.fn() };
    notifications = { notify: jest.fn().mockResolvedValue({}) };
    service = new TerminationService(
      prisma as unknown as PrismaService,
      leases as unknown as LeasesService,
      billing as unknown as BillingService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('create', () => {
    it('любая сторона инициирует при сроке ≥ 30 дней', async () => {
      const date = new Date(Date.now() + 40 * DAY).toISOString();
      await service.create('tenant1', 'l1', { requestedTerminationDate: date });
      expect(prisma.terminationRequest.create).toHaveBeenCalled();
    });

    it('уведомление о заявке использует русскую дату и не раскрывает reason', async () => {
      const date = new Date('2026-10-06T00:00:00.000Z');
      const now = jest
        .spyOn(Date, 'now')
        .mockReturnValue(new Date('2026-08-27T00:00:00.000Z').getTime());

      await service.create('tenant1', 'l1', {
        requestedTerminationDate: date.toISOString(),
        reason: 'Личная секретная причина',
      });

      const input = notifications.notify.mock.calls[0][1];
      expect(input.body).toContain('06.10.2026');
      expect(input.body).not.toContain('Личная секретная причина');
      now.mockRestore();
    });

    it('срок < 30 дней → BadRequest', async () => {
      const date = new Date(Date.now() + 10 * DAY).toISOString();
      await expect(
        service.create('tenant1', 'l1', { requestedTerminationDate: date }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('неактивный договор → Conflict', async () => {
      leases.getForUser.mockResolvedValue({ ...activeLease, status: LeaseStatus.sent });
      const date = new Date(Date.now() + 40 * DAY).toISOString();
      await expect(
        service.create('tenant1', 'l1', { requestedTerminationDate: date }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('finalize', () => {
    it('только landlord финализирует → terminated + пропорция', async () => {
      const reqDate = new Date(Date.now() + 40 * DAY);
      prisma.terminationRequest.findUnique.mockResolvedValue({
        id: 'tr1',
        leaseId: 'l1',
        requestedTerminationDate: reqDate,
        status: TerminationStatus.pending,
      });
      prisma.lease.findUnique.mockResolvedValue(activeLease);

      await service.finalize('landlord1', 'tr1', {});

      expect(prisma.lease.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'l1', status: LeaseStatus.active },
          data: expect.objectContaining({ status: LeaseStatus.terminated }),
        }),
      );
      expect(billing.applyTermination).toHaveBeenCalledWith(activeLease, reqDate);
    });

    it('уведомляет арендатора только после формирования последнего счёта', async () => {
      const reqDate = new Date('2026-10-06T00:00:00.000Z');
      prisma.terminationRequest.findUnique.mockResolvedValue({
        id: 'tr1',
        leaseId: 'l1',
        requestedTerminationDate: reqDate,
        status: TerminationStatus.pending,
      });
      prisma.lease.findUnique.mockResolvedValue(activeLease);

      await service.finalize('landlord1', 'tr1', {});

      expect(notifications.notify).toHaveBeenCalledWith(
        'tenant1',
        expect.objectContaining({
          type: 'termination_finalized',
          body: expect.stringContaining('06.10.2026'),
        }),
      );
      expect(billing.applyTermination.mock.invocationCallOrder[0]).toBeLessThan(
        notifications.notify.mock.invocationCallOrder[0],
      );
    });

    it('tenant не может финализировать → Forbidden', async () => {
      prisma.terminationRequest.findUnique.mockResolvedValue({
        id: 'tr1',
        leaseId: 'l1',
        status: TerminationStatus.pending,
        requestedTerminationDate: new Date(),
      });
      prisma.lease.findUnique.mockResolvedValue(activeLease);
      await expect(
        service.finalize('tenant1', 'tr1', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(billing.applyTermination).not.toHaveBeenCalled();
    });

    it('проигранный захват договора отклоняет запрос без внешних эффектов', async () => {
      prisma.terminationRequest.findUnique.mockResolvedValue({
        id: 'tr1',
        leaseId: 'l1',
        requestedTerminationDate: new Date(),
        status: TerminationStatus.pending,
      });
      prisma.lease.findUnique.mockResolvedValue(activeLease);
      prisma.lease.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.finalize('landlord1', 'tr1', {}),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Договор уже расторгнут',
      });
      expect(prisma.terminationRequest.updateMany).not.toHaveBeenCalled();
      expect(billing.applyTermination).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('проигранный захват заявки бросает внутри транзакции и не запускает внешние эффекты', async () => {
      prisma.terminationRequest.findUnique.mockResolvedValue({
        id: 'tr1',
        leaseId: 'l1',
        requestedTerminationDate: new Date(),
        status: TerminationStatus.pending,
      });
      prisma.lease.findUnique.mockResolvedValue(activeLease);
      prisma.terminationRequest.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.finalize('landlord1', 'tr1', {}),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Заявка уже обработана',
      });
      expect(prisma.lease.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.terminationRequest.updateMany).toHaveBeenCalledTimes(1);
      expect(billing.applyTermination).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('после успеха отменяет остальные pending-заявки только этого договора', async () => {
      const reqDate = new Date(Date.now() + 40 * DAY);
      prisma.terminationRequest.findUnique.mockResolvedValue({
        id: 'tr1',
        leaseId: 'l1',
        requestedTerminationDate: reqDate,
        status: TerminationStatus.pending,
      });
      prisma.lease.findUnique.mockResolvedValue(activeLease);

      const result = await service.finalize('landlord1', 'tr1', {});

      expect(prisma.terminationRequest.updateMany).toHaveBeenNthCalledWith(2, {
        where: {
          leaseId: 'l1',
          status: TerminationStatus.pending,
          id: { not: 'tr1' },
        },
        data: { status: TerminationStatus.cancelled },
      });
      expect(result).toEqual(
        expect.objectContaining({ id: 'tr1', status: TerminationStatus.finalized }),
      );
      expect(billing.applyTermination).toHaveBeenCalledTimes(1);
    });
  });
});
