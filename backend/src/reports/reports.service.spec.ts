import { BillPaymentStatus, BillStage } from '@prisma/client';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;

  beforeEach(() => {
    prisma = { lease: { findMany: jest.fn() } };
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
});
