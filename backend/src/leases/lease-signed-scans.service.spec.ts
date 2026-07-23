import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LeaseParty, LeaseStatus } from '@prisma/client';
import { LeaseSignedScansService } from './lease-signed-scans.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageProvider } from '../storage/storage-provider.interface';

type PrismaMock = {
  lease: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  leaseSignedScan: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
  };
};

const pdf = { buffer: Buffer.from('pdf'), mimetype: 'application/pdf' };

describe('LeaseSignedScansService', () => {
  let service: LeaseSignedScansService;
  let prisma: PrismaMock;
  let storage: jest.Mocked<StorageProvider>;

  const sentLease = {
    id: 'l1',
    propertyId: 'p1',
    landlordId: 'landlord1',
    tenantId: 'tenant1',
    status: LeaseStatus.sent,
  };

  beforeEach(() => {
    prisma = {
      lease: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      leaseSignedScan: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    };
    storage = {
      put: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
      getUrl: jest.fn(),
    };
    const notifications = { notify: jest.fn().mockResolvedValue({}) };
    service = new LeaseSignedScansService(
      prisma as unknown as PrismaService,
      storage,
      notifications as unknown as import('../notifications/notifications.service').NotificationsService,
    );
  });

  it('отклоняет неподдерживаемый тип файла', async () => {
    await expect(
      service.upload('landlord1', 'l1', {
        buffer: Buffer.from('x'),
        mimetype: 'application/zip',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('не сторона договора → NotFound', async () => {
    prisma.lease.findUnique.mockResolvedValue(sentLease);
    await expect(
      service.upload('stranger', 'l1', pdf),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('нельзя грузить скан для черновика → Conflict', async () => {
    prisma.lease.findUnique.mockResolvedValue({
      ...sentLease,
      status: LeaseStatus.draft,
    });
    await expect(service.upload('landlord1', 'l1', pdf)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('первый скан (landlord) сохраняется, но не активирует договор', async () => {
    prisma.lease.findUnique.mockResolvedValue(sentLease);
    prisma.leaseSignedScan.findUnique.mockResolvedValue(null);
    prisma.leaseSignedScan.upsert.mockResolvedValue({ id: 's-landlord' });
    // Только landlord загрузил.
    prisma.leaseSignedScan.findMany.mockResolvedValue([
      { role: LeaseParty.landlord },
    ]);

    const res = await service.upload('landlord1', 'l1', pdf);
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(res.activated).toBe(false);
    expect(prisma.lease.update).not.toHaveBeenCalled();
  });

  it('второй скан (tenant) активирует договор', async () => {
    prisma.lease.findUnique.mockResolvedValue(sentLease);
    prisma.leaseSignedScan.findUnique.mockResolvedValue(null);
    prisma.leaseSignedScan.upsert.mockResolvedValue({ id: 's-tenant' });
    prisma.leaseSignedScan.findMany.mockResolvedValue([
      { role: LeaseParty.landlord },
      { role: LeaseParty.tenant },
    ]);
    prisma.lease.findFirst.mockResolvedValue(null); // нет другого active
    prisma.lease.update.mockResolvedValue({
      ...sentLease,
      status: LeaseStatus.active,
    });

    const res = await service.upload('tenant1', 'l1', pdf);
    expect(res.activated).toBe(true);
    expect(prisma.lease.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { status: LeaseStatus.active },
    });
  });

  it('замена своего скана удаляет старый файл из хранилища', async () => {
    prisma.lease.findUnique.mockResolvedValue(sentLease);
    prisma.leaseSignedScan.findUnique.mockResolvedValue({
      id: 's-old',
      storageKey: 'leases/l1/signed-landlord-old.pdf',
    });
    prisma.leaseSignedScan.upsert.mockResolvedValue({ id: 's-old' });
    prisma.leaseSignedScan.findMany.mockResolvedValue([
      { role: LeaseParty.landlord },
    ]);

    await service.upload('landlord1', 'l1', pdf);
    expect(storage.delete).toHaveBeenCalledWith(
      'leases/l1/signed-landlord-old.pdf',
    );
  });
});
