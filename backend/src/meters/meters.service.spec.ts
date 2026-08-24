import { NotFoundException } from '@nestjs/common';
import { LeaseStatus, MeterType } from '@prisma/client';
import { MetersService } from './meters.service';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';
import { LeasesService } from '../leases/leases.service';
import { BillingService } from '../billing/billing.service';

type PrismaMock = {
  meter: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  meterReading: {
    findFirst: jest.Mock;
  };
  bill: {
    findFirst: jest.Mock;
  };
};

describe('MetersService', () => {
  let service: MetersService;
  let prisma: PrismaMock;
  let properties: { findOneForOwner: jest.Mock };
  let leases: { getForUser: jest.Mock };
  let billing: {
    ensureCurrentDraft: jest.Mock;
    metersPendingForBill: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      meter: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      meterReading: {
        findFirst: jest.fn(),
      },
      bill: {
        findFirst: jest.fn(),
      },
    };
    properties = { findOneForOwner: jest.fn() };
    leases = { getForUser: jest.fn() };
    billing = {
      ensureCurrentDraft: jest.fn().mockResolvedValue(undefined),
      metersPendingForBill: jest.fn().mockResolvedValue([]),
    };
    service = new MetersService(
      prisma as unknown as PrismaService,
      properties as unknown as PropertiesService,
      leases as unknown as LeasesService,
      billing as unknown as BillingService,
    );
  });

  it('create проверяет владение и создаёт счётчик', async () => {
    properties.findOneForOwner.mockResolvedValue({ id: 'p1' });
    prisma.meter.create.mockResolvedValue({ id: 'm1' });
    await service.create('u1', 'p1', {
      meterType: MeterType.electricity,
      name: 'День',
      serialNumber: 'SN-001',
      tariff: 5.47,
      initialReading: 1200,
    });
    expect(properties.findOneForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(prisma.meter.create.mock.calls[0][0].data.propertyId).toBe('p1');
    expect(prisma.meter.create.mock.calls[0][0].data.initialReading).toBe(
      1200,
    );
  });

  it('create на чужой объект → NotFound, счётчик не создаётся', async () => {
    properties.findOneForOwner.mockRejectedValue(new NotFoundException());
    await expect(
      service.create('u1', 'p-foreign', {
        meterType: MeterType.water,
        name: 'ХВС',
        tariff: 40,
        initialReading: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.meter.create).not.toHaveBeenCalled();
  });

  it('update чужого/несуществующего счётчика → NotFound', async () => {
    properties.findOneForOwner.mockResolvedValue({ id: 'p1' });
    prisma.meter.findFirst.mockResolvedValue(null);
    await expect(
      service.update('u1', 'p1', 'm-foreign', { tariff: 6 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.meter.update).not.toHaveBeenCalled();
  });

  it('list фильтруется по объекту и подмешивает lastReadingValue', async () => {
    properties.findOneForOwner.mockResolvedValue({ id: 'p1' });
    prisma.meter.findMany.mockResolvedValue([
      { id: 'm1', initialReading: 100, readings: [{ value: 250 }] },
      { id: 'm2', initialReading: 50, readings: [] },
    ]);
    const result = await service.findAll('u1', 'p1');
    expect(prisma.meter.findMany.mock.calls[0][0].where).toEqual({
      propertyId: 'p1',
    });
    expect(result[0].lastReadingValue).toBe(250);
    expect(result[1].lastReadingValue).toBe(50);
    expect((result[0] as { readings?: unknown }).readings).toBeUndefined();
  });

  it('create/update передают calibrationDueDate как Date (ADR-0015)', async () => {
    properties.findOneForOwner.mockResolvedValue({ id: 'p1' });
    prisma.meter.create.mockResolvedValue({ id: 'm1' });
    await service.create('u1', 'p1', {
      meterType: MeterType.electricity,
      name: 'День',
      tariff: 5.47,
      initialReading: 0,
      calibrationDueDate: '2030-02-01',
    });
    expect(
      prisma.meter.create.mock.calls[0][0].data.calibrationDueDate,
    ).toEqual(new Date('2030-02-01'));

    prisma.meter.findFirst.mockResolvedValue({ id: 'm1' });
    await service.update('u1', 'p1', 'm1', {
      calibrationDueDate: '2031-02-01',
    });
    expect(
      prisma.meter.update.mock.calls[0][0].data.calibrationDueDate,
    ).toEqual(new Date('2031-02-01'));
  });

  it('findAllForLease пускает landlord/tenant и считает currentPeriodSubmitted (ADR-0015)', async () => {
    leases.getForUser.mockResolvedValue({
      id: 'l1',
      propertyId: 'p1',
      paymentDay: 5,
      status: LeaseStatus.active,
    });
    prisma.bill.findFirst.mockResolvedValue({
      id: 'b1',
      periodStart: new Date(Date.UTC(2026, 7, 5, 12)),
      periodEnd: new Date(Date.UTC(2026, 8, 5, 12)),
    });
    prisma.meter.findMany.mockResolvedValue([
      { id: 'm1', isActive: true, initialReading: 100, readings: [{ value: 250 }] },
      { id: 'm2', isActive: true, initialReading: 50, readings: [] },
    ]);
    billing.metersPendingForBill.mockResolvedValue([
      { id: 'm2', name: 'ХВС' },
    ]);

    const result = await service.findAllForLease('u1', 'l1');

    expect(leases.getForUser).toHaveBeenCalledWith('u1', 'l1');
    expect(prisma.meter.findMany.mock.calls[0][0].where).toEqual({
      propertyId: 'p1',
    });
    expect(result.meters[0].currentPeriodSubmitted).toBe(true);
    expect(result.meters[1].currentPeriodSubmitted).toBe(false);
    expect(result.meters[0].readingsStatus).toBe('submitted');
    expect(result.periodStart).toBeInstanceOf(Date);
    expect(result.periodEnd).toBeInstanceOf(Date);
    expect(result.readingsDueDate.toISOString()).toBe(
      '2026-08-31T12:00:00.000Z',
    );
    expect(billing.ensureCurrentDraft).toHaveBeenCalled();
    expect(billing.metersPendingForBill).toHaveBeenCalledWith({
      id: 'b1',
      propertyId: 'p1',
    });
  });

  it('findAllForLease на чужой договор → NotFound (проксирует getForUser)', async () => {
    leases.getForUser.mockRejectedValue(new NotFoundException());
    await expect(
      service.findAllForLease('u1', 'l-foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.meter.findMany).not.toHaveBeenCalled();
  });

  it('findAllForLease для неактивного договора без черновика возвращает not_required', async () => {
    leases.getForUser.mockResolvedValue({
      id: 'l1',
      propertyId: 'p1',
      paymentDay: 5,
      status: LeaseStatus.terminated,
    });
    prisma.bill.findFirst.mockResolvedValue(null);
    prisma.meter.findMany.mockResolvedValue([
      { id: 'm1', isActive: true, initialReading: 50, readings: [] },
    ]);

    const result = await service.findAllForLease('u1', 'l1');

    expect(result.meters[0].readingsStatus).toBe('not_required');
    expect(result.meters[0].currentPeriodSubmitted).toBe(false);
    expect(billing.ensureCurrentDraft).not.toHaveBeenCalled();
    expect(billing.metersPendingForBill).not.toHaveBeenCalled();
  });
});
