import { BillPaymentStatus, BillStage } from '@prisma/client';
import {
  billTotal,
  computeAccruedPenalty,
  computePeriod,
  isOverdue,
  nextPeriod,
} from './billing.util';

describe('billing.util', () => {
  describe('computePeriod', () => {
    it('строит период paymentDay→paymentDay вокруг даты', () => {
      const ref = new Date(Date.UTC(2026, 8, 25, 0, 0, 0)); // 25.09
      const p = computePeriod(ref, 20);
      expect(p.periodStart.toISOString()).toBe('2026-09-20T12:00:00.000Z');
      expect(p.periodEnd.toISOString()).toBe('2026-10-20T12:00:00.000Z');
      expect(p.dueDate.getTime()).toBe(p.periodEnd.getTime());
    });

    it('до paymentDay в месяце — период начался в прошлом месяце', () => {
      const ref = new Date(Date.UTC(2026, 8, 5, 0, 0, 0)); // 05.09, до 20-го
      const p = computePeriod(ref, 20);
      expect(p.periodStart.toISOString()).toBe('2026-08-20T12:00:00.000Z');
      expect(p.periodEnd.toISOString()).toBe('2026-09-20T12:00:00.000Z');
    });

    it('переход через год (декабрь→январь)', () => {
      const ref = new Date(Date.UTC(2026, 11, 25, 0, 0, 0));
      const p = computePeriod(ref, 20);
      expect(p.periodEnd.toISOString()).toBe('2027-01-20T12:00:00.000Z');
    });
  });

  it('nextPeriod продолжает от границы', () => {
    const end = new Date(Date.UTC(2026, 9, 20, 12, 0, 0));
    const p = nextPeriod(end, 20);
    expect(p.periodStart.getTime()).toBe(end.getTime());
    expect(p.periodEnd.toISOString()).toBe('2026-11-20T12:00:00.000Z');
  });

  it('billTotal суммирует статьи', () => {
    expect(billTotal([{ amount: 50000 }, { amount: 1500.5 }])).toBe(51500.5);
  });

  describe('computeAccruedPenalty', () => {
    const base = {
      total: 50000,
      penaltyRatePercentPerDay: 0.1, // 0.1%/день
      dueDate: new Date(Date.UTC(2026, 9, 20, 12, 0, 0)),
      stage: BillStage.final,
      paymentStatus: BillPaymentStatus.pending,
      penaltyWaived: false,
    };

    it('0 до срока оплаты', () => {
      const now = new Date(Date.UTC(2026, 9, 20, 12, 0, 0));
      expect(computeAccruedPenalty({ ...base, now })).toBe(0);
    });

    it('копится по дням просрочки', () => {
      const now = new Date(Date.UTC(2026, 9, 30, 12, 0, 0)); // +10 дней
      // 50000 * 0.001 * 10 = 500
      expect(computeAccruedPenalty({ ...base, now })).toBe(500);
    });

    it('продолжает копиться в статусе payment_claimed', () => {
      const now = new Date(Date.UTC(2026, 9, 30, 12, 0, 0));
      expect(
        computeAccruedPenalty({
          ...base,
          paymentStatus: BillPaymentStatus.payment_claimed,
          now,
        }),
      ).toBe(500);
    });

    it('останавливается в статусе paid', () => {
      const now = new Date(Date.UTC(2026, 9, 30, 12, 0, 0));
      expect(
        computeAccruedPenalty({
          ...base,
          paymentStatus: BillPaymentStatus.paid,
          now,
        }),
      ).toBe(0);
    });

    it('прощение возвращает замороженную сумму', () => {
      const now = new Date(Date.UTC(2026, 11, 30, 12, 0, 0));
      expect(
        computeAccruedPenalty({
          ...base,
          penaltyWaived: true,
          penaltyWaivedAmount: 500,
          now,
        }),
      ).toBe(500);
    });

    it('черновик не копит пеню', () => {
      const now = new Date(Date.UTC(2026, 9, 30, 12, 0, 0));
      expect(
        computeAccruedPenalty({ ...base, stage: BillStage.draft, now }),
      ).toBe(0);
    });
  });

  describe('isOverdue', () => {
    const due = new Date(Date.UTC(2026, 9, 20, 12, 0, 0));
    it('финал, ожидается, срок прошёл → true', () => {
      expect(
        isOverdue(
          { stage: BillStage.final, paymentStatus: BillPaymentStatus.pending, dueDate: due },
          new Date(Date.UTC(2026, 9, 21, 12, 0, 0)),
        ),
      ).toBe(true);
    });
    it('оплачен → false', () => {
      expect(
        isOverdue(
          { stage: BillStage.final, paymentStatus: BillPaymentStatus.paid, dueDate: due },
          new Date(Date.UTC(2026, 9, 21, 12, 0, 0)),
        ),
      ).toBe(false);
    });
  });
});
