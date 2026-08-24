import { BillPaymentStatus, BillStage } from '@prisma/client';
import {
  billTotal,
  calendarDaysUntil,
  computeAccruedPenalty,
  computePeriod,
  computeReadingsDueDate,
  computeReadingsStatus,
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

  describe('срок и статус показаний (ADR-0024)', () => {
    it('computeReadingsDueDate вычитает ровно 5 дней', () => {
      const periodEnd = new Date(Date.UTC(2026, 9, 20, 12));
      expect(computeReadingsDueDate(periodEnd).toISOString()).toBe(
        '2026-10-15T12:00:00.000Z',
      );
      expect(periodEnd.toISOString()).toBe('2026-10-20T12:00:00.000Z');
    });

    it('при paymentDay 1..28 срок всегда строго внутри периода', () => {
      for (let paymentDay = 1; paymentDay <= 28; paymentDay += 1) {
        for (let month = 0; month < 12; month += 1) {
          const period = computePeriod(
            new Date(Date.UTC(2028, month, 15, 12)),
            paymentDay,
          );
          const due = computeReadingsDueDate(period.periodEnd);
          expect(due.getTime()).toBeGreaterThan(period.periodStart.getTime());
          expect(due.getTime()).toBeLessThan(period.periodEnd.getTime());
        }
      }
    });

    it('calendarDaysUntil не зависит от часа внутри суток', () => {
      const target = new Date(Date.UTC(2026, 9, 20, 12));
      expect(
        calendarDaysUntil(target, new Date(Date.UTC(2026, 9, 17, 0, 30))),
      ).toBe(3);
      expect(
        calendarDaysUntil(target, new Date(Date.UTC(2026, 9, 17, 23, 30))),
      ).toBe(3);
    });

    it.each([
      { meterActive: false, leaseActive: true },
      { meterActive: true, leaseActive: false },
    ])('неактивная обязанность имеет not_required', (activity) => {
      expect(
        computeReadingsStatus({
          ...activity,
          submitted: false,
          readingsDueDate: new Date(Date.UTC(2026, 9, 20)),
          now: new Date(Date.UTC(2026, 9, 21)),
        }),
      ).toBe('not_required');
    });

    it('закрытая активная обязанность имеет submitted', () => {
      expect(
        computeReadingsStatus({
          meterActive: true,
          leaseActive: true,
          submitted: true,
          readingsDueDate: new Date(Date.UTC(2026, 9, 20)),
          now: new Date(Date.UTC(2026, 9, 21)),
        }),
      ).toBe('submitted');
    });

    it('весь день дедлайна остаётся due', () => {
      const readingsDueDate = new Date(Date.UTC(2026, 9, 20, 12));
      for (const hour of [0, 12, 23]) {
        expect(
          computeReadingsStatus({
            meterActive: true,
            leaseActive: true,
            submitted: false,
            readingsDueDate,
            now: new Date(Date.UTC(2026, 9, 20, hour, 59)),
          }),
        ).toBe('due');
      }
    });

    it('со следующих календарных суток статус overdue и дней -1', () => {
      const readingsDueDate = new Date(Date.UTC(2026, 9, 20, 12));
      const now = new Date(Date.UTC(2026, 9, 21, 0, 1));
      expect(calendarDaysUntil(readingsDueDate, now)).toBe(-1);
      expect(
        computeReadingsStatus({
          meterActive: true,
          leaseActive: true,
          submitted: false,
          readingsDueDate,
          now,
        }),
      ).toBe('overdue');
    });
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

    it.each([0, -100])('при итоге %s пеня равна 0', (total) => {
      const now = new Date(Date.UTC(2026, 9, 30, 12, 0, 0));
      expect(computeAccruedPenalty({ ...base, total, now })).toBe(0);
    });
  });

  describe('isOverdue', () => {
    const due = new Date(Date.UTC(2026, 9, 20, 12, 0, 0));
    it('финал, ожидается, срок прошёл → true', () => {
      expect(
        isOverdue(
          { stage: BillStage.final, paymentStatus: BillPaymentStatus.pending, dueDate: due },
          50000,
          new Date(Date.UTC(2026, 9, 21, 12, 0, 0)),
        ),
      ).toBe(true);
    });
    it('оплачен → false', () => {
      expect(
        isOverdue(
          { stage: BillStage.final, paymentStatus: BillPaymentStatus.paid, dueDate: due },
          50000,
          new Date(Date.UTC(2026, 9, 21, 12, 0, 0)),
        ),
      ).toBe(false);
    });

    it.each([0, -0.01])('при итоге %s просрочки нет', (total) => {
      expect(
        isOverdue(
          { stage: BillStage.final, paymentStatus: BillPaymentStatus.pending, dueDate: due },
          total,
          new Date(Date.UTC(2026, 9, 21, 12, 0, 0)),
        ),
      ).toBe(false);
    });
  });
});
