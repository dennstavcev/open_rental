import {
  BillPaymentStatus,
  BillStage,
  LeaseStatus,
  MaintenanceStatus,
  ServiceType,
  SettlementPayer,
} from '@prisma/client';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      lease: { findMany: jest.fn().mockResolvedValue([]) },
      property: { findMany: jest.fn().mockResolvedValue([]) },
      maintenanceRequest: { groupBy: jest.fn().mockResolvedValue([]) },
      service: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ReportsService(prisma as unknown as PrismaService);
  });

  it('агрегирует доходы, просрочки и сроки договоров', async () => {
    const now = new Date(Date.UTC(2026, 9, 30, 12, 0, 0));
    jest.useFakeTimers().setSystemTime(now);

    prisma.lease.findMany.mockResolvedValue([
      {
        id: 'l1',
        endDate: new Date(Date.UTC(2026, 10, 20, 12, 0, 0)), // ~21 день
        property: { address: 'Москва, Тверская 1' },
        tenant: { email: 'tenant@mail.ru' },
        bills: [
          // Оплаченный счёт → доход.
          {
            id: 'b-paid',
            stage: BillStage.final,
            paymentStatus: BillPaymentStatus.paid,
            lineItems: [{ amount: 50000 }],
            penaltyRatePercentPerDay: 0.1,
            penaltyWaived: false,
            penaltyWaivedAmount: null,
            dueDate: new Date(Date.UTC(2026, 8, 20, 12, 0, 0)),
            payment: { amount: 50000, confirmedAt: new Date(Date.UTC(2026, 8, 21, 10, 0, 0)) },
          },
          // Просроченный неоплаченный (10 дней) → outstanding + overdue + пеня 500.
          {
            id: 'b-overdue',
            stage: BillStage.final,
            paymentStatus: BillPaymentStatus.pending,
            lineItems: [{ amount: 50000 }],
            penaltyRatePercentPerDay: 0.1,
            penaltyWaived: false,
            penaltyWaivedAmount: null,
            dueDate: new Date(Date.UTC(2026, 9, 20, 12, 0, 0)),
            payment: null,
          },
        ],
      },
    ]);

    const s = await service.getLandlordSummary('landlord1');

    expect(s.income.total).toBe(50000);
    expect(s.income.byMonth).toEqual([{ month: '2026-09', amount: 50000 }]);
    expect(s.outstanding.totalDue).toBe(50500); // 50000 + пеня 500
    expect(s.outstanding.overdue).toHaveLength(1);
    expect(s.outstanding.overdue[0].tenantEmail).toBe('tenant@mail.ru');
    expect(s.outstanding.overdue[0].daysOverdue).toBe(10);
    expect(s.leaseExpirations.within30).toBe(1);
    expect(s.leaseExpirations.within90).toBe(1);

    jest.useRealTimers();
  });

  it('пустая сводка без договоров', async () => {
    prisma.lease.findMany.mockResolvedValue([]);
    const s = await service.getLandlordSummary('landlord1');
    expect(s.income.total).toBe(0);
    expect(s.outstanding.overdue).toEqual([]);
    expect(s.leaseExpirations.within90).toBe(0);
  });

  it('показывает объект без договоров свободным с нулевыми показателями', async () => {
    prisma.property.findMany.mockResolvedValue([
      { id: 'p-vacant', address: 'Москва, Тверская 1', city: 'Москва' },
    ]);

    const s = await service.getLandlordSummary('landlord1');

    expect(s.portfolio.entries).toEqual([
      {
        propertyId: 'p-vacant',
        address: 'Москва, Тверская 1',
        city: 'Москва',
        status: 'vacant',
        tenantEmail: null,
        monthlyRent: null,
        incomeTotal: 0,
        outstandingTotal: 0,
        openRequests: 0,
        inProgressRequests: 0,
        pendingServicesAmount: 0,
      },
    ]);
  });

  it.each([
    LeaseStatus.draft,
    LeaseStatus.sent,
  ])('показывает договор %s как ожидание арендатора', async (status) => {
    prisma.property.findMany.mockResolvedValue([
      { id: 'p1', address: 'Москва, Арбат 1', city: 'Москва' },
    ]);
    prisma.lease.findMany.mockResolvedValue([
      leaseRow({ status, tenant: { email: 'tenant@mail.ru' } }),
    ]);

    const s = await service.getLandlordSummary('landlord1');

    expect(s.portfolio.entries[0]).toEqual(
      expect.objectContaining({
        status: 'pending',
        tenantEmail: null,
        monthlyRent: null,
      }),
    );
  });

  it('для двух активных договоров выбирает начавшийся позднее', async () => {
    prisma.property.findMany.mockResolvedValue([
      { id: 'p1', address: 'Москва, Арбат 1', city: 'Москва' },
    ]);
    prisma.lease.findMany.mockResolvedValue([
      leaseRow({
        id: 'old',
        status: LeaseStatus.active,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        rentAmount: 40000,
        tenant: { email: 'old@mail.ru' },
      }),
      leaseRow({
        id: 'new',
        status: LeaseStatus.active,
        startDate: new Date('2026-02-01T00:00:00.000Z'),
        rentAmount: 50000,
        tenant: { email: 'new@mail.ru' },
      }),
    ]);

    const entry = (await service.getLandlordSummary('landlord1')).portfolio
      .entries[0];

    expect(entry.status).toBe('rented');
    expect(entry.tenantEmail).toBe('new@mail.ru');
    expect(entry.monthlyRent).toBe(50000);
  });

  it('сохраняет деньги расторгнутого договора и считает их теми же ветками', async () => {
    jest
      .useFakeTimers()
      .setSystemTime(new Date('2026-10-30T12:00:00.000Z'));
    prisma.property.findMany.mockResolvedValue([
      { id: 'p1', address: 'Москва, Арбат 1', city: 'Москва' },
    ]);
    prisma.lease.findMany.mockResolvedValue([
      leaseRow({
        status: LeaseStatus.terminated,
        bills: [
          {
            id: 'paid',
            stage: BillStage.final,
            paymentStatus: BillPaymentStatus.paid,
            lineItems: [{ amount: 200 }],
            penaltyRatePercentPerDay: 0.1,
            penaltyWaived: false,
            penaltyWaivedAmount: null,
            dueDate: new Date('2026-09-20T12:00:00.000Z'),
            payment: {
              amount: 200,
              confirmedAt: new Date('2026-09-21T12:00:00.000Z'),
            },
          },
          {
            id: 'waived',
            stage: BillStage.final,
            paymentStatus: BillPaymentStatus.pending,
            lineItems: [{ amount: 100 }],
            penaltyRatePercentPerDay: 0.1,
            penaltyWaived: true,
            penaltyWaivedAmount: 50,
            dueDate: new Date('2026-09-20T12:00:00.000Z'),
            payment: null,
          },
        ],
      }),
    ]);

    const s = await service.getLandlordSummary('landlord1');
    const entry = s.portfolio.entries[0];

    expect(entry.status).toBe('vacant');
    expect(entry.incomeTotal).toBe(200);
    expect(entry.outstandingTotal).toBe(100);
    expect(
      s.portfolio.entries.reduce((sum, item) => sum + item.incomeTotal, 0),
    ).toBe(s.income.total);
    expect(
      s.portfolio.entries.reduce(
        (sum, item) => sum + item.outstandingTotal,
        0,
      ),
    ).toBe(s.outstanding.totalDue);

    jest.useRealTimers();
  });

  it('считает незакрытые заявки по всем договорам объекта', async () => {
    prisma.property.findMany.mockResolvedValue([
      { id: 'p1', address: 'Москва, Арбат 1', city: 'Москва' },
    ]);
    prisma.lease.findMany.mockResolvedValue([
      leaseRow({ id: 'active', status: LeaseStatus.active }),
      leaseRow({ id: 'terminated', status: LeaseStatus.terminated }),
    ]);
    prisma.maintenanceRequest.groupBy.mockResolvedValue([
      {
        leaseId: 'active',
        status: MaintenanceStatus.open,
        _count: { _all: 2 },
      },
      {
        leaseId: 'terminated',
        status: MaintenanceStatus.in_progress,
        _count: { _all: 3 },
      },
    ]);

    const s = await service.getLandlordSummary('landlord1');

    expect(s.portfolio.entries[0]).toEqual(
      expect.objectContaining({ openRequests: 2, inProgressRequests: 3 }),
    );
    expect(s.portfolio.totals.activeRequests).toBe(5);
    expect(prisma.maintenanceRequest.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [MaintenanceStatus.open, MaintenanceStatus.in_progress],
          },
          lease: { landlordId: 'landlord1' },
        }),
      }),
    );
  });

  it('считает деньги на подходе единым правилом плательщика', async () => {
    prisma.property.findMany.mockResolvedValue([
      { id: 'p1', address: 'Москва, Арбат 1', city: 'Москва' },
    ]);
    prisma.service.findMany.mockResolvedValue([
      { propertyId: 'p1', price: 10.01, payer: SettlementPayer.tenant },
      { propertyId: 'p1', price: 10.01, payer: SettlementPayer.split },
      { propertyId: 'p1', price: 10.01, payer: SettlementPayer.owner },
    ]);

    const s = await service.getLandlordSummary('landlord1');

    expect(s.portfolio.entries[0].pendingServicesAmount).toBe(5.01);
    expect(s.portfolio.totals.pendingServicesAmount).toBe(5.01);
    expect(prisma.service.findMany).toHaveBeenCalledWith({
      where: {
        property: { ownerId: 'landlord1' },
        serviceType: ServiceType.one_time,
        billedAt: null,
        sourceRequest: { lease: { landlordId: 'landlord1' } },
      },
      select: { propertyId: true, price: true, payer: true },
    });
  });

  it('соблюдает итоги статусов, принадлежность и порядок объектов', async () => {
    prisma.property.findMany.mockResolvedValue([
      { id: 'p-rented', address: 'Москва, Арбат 1', city: 'Москва' },
      { id: 'p-pending', address: 'Москва, Арбат 2', city: 'Москва' },
      { id: 'p-foreign', address: 'Старый адрес', city: null },
    ]);
    prisma.lease.findMany.mockResolvedValue([
      leaseRow({ propertyId: 'p-rented', status: LeaseStatus.active }),
      leaseRow({ propertyId: 'p-pending', status: LeaseStatus.draft }),
    ]);

    const s = await service.getLandlordSummary('landlord1');

    expect(s.portfolio.entries.map((entry) => entry.propertyId)).toEqual([
      'p-rented',
      'p-pending',
      'p-foreign',
    ]);
    expect(s.portfolio.entries[2]).toEqual(
      expect.objectContaining({
        status: 'vacant',
        incomeTotal: 0,
        outstandingTotal: 0,
      }),
    );
    expect(s.portfolio.totals.properties).toBe(
      s.portfolio.totals.rented +
        s.portfolio.totals.pending +
        s.portfolio.totals.vacant,
    );
    expect(prisma.lease.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { landlordId: 'landlord1' } }),
    );
    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: 'landlord1' },
        orderBy: [
          { city: 'asc' },
          { street: 'asc' },
          { house: 'asc' },
          { createdAt: 'desc' },
        ],
      }),
    );
  });
});

function leaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    propertyId: 'p1',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2030-01-01T00:00:00.000Z'),
    rentAmount: 45000,
    status: LeaseStatus.terminated,
    property: { address: 'Москва, Арбат 1' },
    tenant: null,
    bills: [],
    ...overrides,
  };
}
