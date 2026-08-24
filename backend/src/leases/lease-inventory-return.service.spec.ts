import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InventoryReturnStatus, LeaseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeaseInventoryItemsService } from './lease-inventory-items.service';
import { LeasesService } from './leases.service';

describe('LeaseInventoryItemsService — состояние при возврате', () => {
  let service: LeaseInventoryItemsService;
  let prisma: any;
  let leases: { getOwnedTerminated: jest.Mock };

  beforeEach(() => {
    prisma = {
      lease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'l1',
          landlordId: 'owner1',
          status: LeaseStatus.terminated,
          returnActConfirmedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      leaseInventoryItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'i1', leaseId: 'l1' }),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'i1', ...data })),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    leases = { getOwnedTerminated: jest.fn().mockResolvedValue({ id: 'l1' }) };
    service = new LeaseInventoryItemsService(
      prisma as PrismaService,
      leases as unknown as LeasesService,
    );
  });

  it('на активном договоре возвращает Conflict', async () => {
    leases.getOwnedTerminated.mockRejectedValue(
      new ConflictException(
        'Состояние имущества фиксируется после расторжения договора',
      ),
    );

    await expect(
      service.updateReturnState('owner1', 'l1', 'i1', {
        returnStatus: InventoryReturnStatus.ok,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('не собственнику не раскрывает договор', async () => {
    leases.getOwnedTerminated.mockRejectedValue(
      new NotFoundException('Договор не найден'),
    );

    await expect(
      service.updateReturnState('stranger', 'l1', 'i1', {
        returnStatus: InventoryReturnStatus.ok,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('после подтверждения запрещает правку', async () => {
    prisma.lease.findUnique.mockResolvedValue({
      id: 'l1',
      landlordId: 'owner1',
      status: LeaseStatus.terminated,
      returnActConfirmedAt: new Date(),
    });

    await expect(
      service.updateReturnState('owner1', 'l1', 'i1', {
        returnStatus: InventoryReturnStatus.missing,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.leaseInventoryItem.update).not.toHaveBeenCalled();
  });

  it('сохраняет состояние и сбрасывает отправку под блокировкой', async () => {
    await service.updateReturnState('owner1', 'l1', 'i1', {
      returnStatus: InventoryReturnStatus.damaged,
      returnNote: 'Царапина',
      damageAmount: 1500.25,
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.lease.findUnique.mock.invocationCallOrder[0],
    );
    expect(prisma.leaseInventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: {
        returnStatus: InventoryReturnStatus.damaged,
        returnNote: 'Царапина',
        damageAmount: 1500.25,
      },
    });
    expect(prisma.lease.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { returnActSubmittedAt: null },
    });
  });

  it('не принимает ненулевой ущерб для позиции в норме', async () => {
    await expect(
      service.updateReturnState('owner1', 'l1', 'i1', {
        returnStatus: InventoryReturnStatus.ok,
        damageAmount: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('принимает повреждение без денежной оценки', async () => {
    await expect(
      service.updateReturnState('owner1', 'l1', 'i1', {
        returnStatus: InventoryReturnStatus.damaged,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        returnStatus: InventoryReturnStatus.damaged,
        damageAmount: null,
      }),
    );
  });
});
