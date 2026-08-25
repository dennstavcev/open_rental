import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  InventoryReturnStatus,
  LeaseStatus,
  Prisma,
} from '@prisma/client';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeaseDocumentsService } from './lease-documents.service';
import { LeasesService } from './leases.service';

function lease(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    landlordId: 'owner1',
    tenantId: 'tenant1',
    status: LeaseStatus.terminated,
    endDate: new Date(),
    effectiveEndDate: null,
    depositReturnAmount: new Prisma.Decimal(10_000),
    returnActConfirmedAt: null,
    returnActDamageTotal: null,
    returnActDepositReturn: null,
    returnActUncovered: null,
    property: { address: 'г. Иркутск, ул. Ленина, д. 1', city: 'Иркутск' },
    ...overrides,
  };
}

describe('LeaseDocumentsService — акт возврата', () => {
  let service: LeaseDocumentsService;
  let prisma: any;
  let leases: { getForUser: jest.Mock };

  beforeEach(() => {
    prisma = {
      lease: { findUnique: jest.fn().mockResolvedValue(lease()) },
      leaseInventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
      leaseDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'd1', ...data })),
      },
    };
    leases = { getForUser: jest.fn().mockResolvedValue(lease()) };
    service = new LeaseDocumentsService(
      prisma as PrismaService,
      leases as unknown as LeasesService,
      { decrypt: jest.fn() } as unknown as CryptoService,
    );
  });

  it('до расторжения не генерирует акт', async () => {
    prisma.lease.findUnique.mockResolvedValue(
      lease({ status: LeaseStatus.active }),
    );

    await expect(
      service.generateReturnAct('owner1', 'l1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('арендатор не может генерировать акт', async () => {
    await expect(
      service.generateReturnAct('tenant1', 'l1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('обе стороны читают последнюю готовую версию', async () => {
    prisma.leaseDocument.findFirst.mockResolvedValue({ id: 'd1', version: 1 });

    await service.getLatestReturnAct('tenant1', 'l1');

    expect(leases.getForUser).toHaveBeenCalledWith('tenant1', 'l1');
    expect(prisma.leaseDocument.findFirst).toHaveBeenCalledWith({
      where: { leaseId: 'l1', kind: 'return_act' },
      orderBy: { version: 'desc' },
    });
  });

  it('вторая генерация создаёт версию 2', async () => {
    prisma.leaseDocument.findFirst.mockResolvedValue({ version: 1 });

    const doc = await service.generateReturnAct('owner1', 'l1');

    expect(doc.version).toBe(2);
    expect(doc.kind).toBe('return_act');
    expect(doc.content).toContain('<b>г. Иркутск</b>');
  });

  it('при пустом городе печатает прочерк и не падает', async () => {
    prisma.lease.findUnique.mockResolvedValue(
      lease({ property: { address: 'Старый свободный адрес', city: null } }),
    );

    const doc = await service.generateReturnAct('owner1', 'l1');

    expect(doc.content).toContain('<b>г. ____________</b>');
  });

  it('в черновике показывает превышение только когда оно есть', async () => {
    prisma.leaseInventoryItem.findMany.mockResolvedValue([
      {
        type: 'Диван',
        brand: null,
        model: null,
        quantity: 1,
        returnStatus: InventoryReturnStatus.missing,
        returnNote: null,
        damageAmount: new Prisma.Decimal(25_000),
      },
    ]);

    const withDebt = await service.generateReturnAct('owner1', 'l1');
    expect(withDebt.content).toContain('Задолженность сверх депозита');
    expect(withDebt.content).toContain('15000.00 ₽');

    prisma.leaseInventoryItem.findMany.mockResolvedValue([
      {
        type: 'Диван',
        brand: null,
        model: null,
        quantity: 1,
        returnStatus: InventoryReturnStatus.damaged,
        returnNote: null,
        damageAmount: new Prisma.Decimal(5000),
      },
    ]);
    const withoutDebt = await service.generateReturnAct('owner1', 'l1');
    expect(withoutDebt.content).not.toContain('Задолженность сверх депозита');
  });

  it('подтверждённый акт печатает денежный снимок, а не живые значения', async () => {
    prisma.lease.findUnique.mockResolvedValue(
      lease({
        depositReturnAmount: new Prisma.Decimal(5000),
        returnActConfirmedAt: new Date('2026-08-24T12:00:00Z'),
        returnActDamageTotal: new Prisma.Decimal(25_000),
        returnActDepositReturn: new Prisma.Decimal(0),
        returnActUncovered: new Prisma.Decimal(15_000),
      }),
    );
    // Позиция могла бы дать другой пересчёт; подтверждённая печать обязана
    // игнорировать это для денежных итогов.
    prisma.leaseInventoryItem.findMany.mockResolvedValue([
      {
        type: 'Диван',
        brand: null,
        model: null,
        quantity: 1,
        returnStatus: InventoryReturnStatus.missing,
        returnNote: null,
        damageAmount: new Prisma.Decimal(30_000),
      },
    ]);

    const doc = await service.generateReturnAct('owner1', 'l1');

    expect(doc.content).toContain('Итого ущерб</b></td><td>25000.00 ₽');
    expect(doc.content).toContain('Депозит к возврату</b></td><td>0.00 ₽');
    expect(doc.content).toContain(
      'Задолженность сверх депозита</b></td><td>15000.00 ₽',
    );
    expect(doc.content).not.toContain(
      'Задолженность сверх депозита</b></td><td>25000.00 ₽',
    );
  });
});
