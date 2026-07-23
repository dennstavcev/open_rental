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

  beforeEach(() => {
    prisma = {
      terminationRequest: {
        create: jest.fn().mockResolvedValue({ id: 'tr1' }),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'tr1' }),
      },
      lease: { findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    leases = { getForUser: jest.fn().mockResolvedValue(activeLease) };
    billing = { applyTermination: jest.fn() };
    service = new TerminationService(
      prisma as unknown as PrismaService,
      leases as unknown as LeasesService,
      billing as unknown as BillingService,
    );
  });

  describe('create', () => {
    it('любая сторона инициирует при сроке ≥ 30 дней', async () => {
      const date = new Date(Date.now() + 40 * DAY).toISOString();
      await service.create('tenant1', 'l1', { requestedTerminationDate: date });
      expect(prisma.terminationRequest.create).toHaveBeenCalled();
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

      expect(prisma.lease.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: LeaseStatus.terminated }),
        }),
      );
      expect(billing.applyTermination).toHaveBeenCalledWith(activeLease, reqDate);
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
  });
});
