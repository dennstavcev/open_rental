import { BillPaymentStatus, BillStage } from '@prisma/client';

// Денежные вычисления в домене — на number с округлением до 2 знаков
// (достаточно для MVP, см. docs/CHANGELOG.md).
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// 12:00 UTC указанного дня. Полная привязка к Property.timezone —
// отдельный инкремент с планировщиком (см. docs/CHANGELOG.md); здесь
// детерминированный UTC-расчёт для ленивых пеней и границ периода.
function boundary(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
}

// Целое число дней между двумя моментами (для пропорции периода).
export function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / MS_PER_DAY));
}

export interface Period {
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
}

// Расчётный период, содержащий reference: от paymentDay 12:00 текущего
// «платёжного» месяца до paymentDay 12:00 следующего (paymentDay ∈ 1..28,
// существует в любом месяце). Оплата счёта — по границе периода (dueDate).
export function computePeriod(reference: Date, paymentDay: number): Period {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  let periodStart = boundary(y, m, paymentDay);
  if (reference.getTime() < periodStart.getTime()) {
    periodStart = boundary(y, m - 1, paymentDay);
  }
  const periodEnd = boundary(
    periodStart.getUTCFullYear(),
    periodStart.getUTCMonth() + 1,
    paymentDay,
  );
  return { periodStart, periodEnd, dueDate: periodEnd };
}

// Период, следующий сразу за границей prevPeriodEnd.
export function nextPeriod(prevPeriodEnd: Date, paymentDay: number): Period {
  const periodEnd = boundary(
    prevPeriodEnd.getUTCFullYear(),
    prevPeriodEnd.getUTCMonth() + 1,
    paymentDay,
  );
  return { periodStart: prevPeriodEnd, periodEnd, dueDate: periodEnd };
}

export function billTotal(lineItems: Array<{ amount: unknown }>): number {
  return round2(
    lineItems.reduce((sum, li) => sum + toNumber(li.amount), 0),
  );
}

export interface PenaltyInput {
  total: number;
  penaltyRatePercentPerDay: unknown;
  dueDate: Date;
  now: Date;
  stage: BillStage;
  paymentStatus: BillPaymentStatus | null;
  penaltyWaived: boolean;
  penaltyWaivedAmount?: unknown;
}

// Пеня — ленивый расчёт. Копится по дням просрочки, продолжает копиться в
// payment_claimed, останавливается в paid; прощение замораживает сумму
// (ADR-0012, docs/MVP_SCOPE.md «Пени»).
export function computeAccruedPenalty(input: PenaltyInput): number {
  if (input.penaltyWaived) {
    return round2(toNumber(input.penaltyWaivedAmount ?? 0));
  }
  if (input.stage !== BillStage.final) {
    return 0;
  }
  if (input.paymentStatus === BillPaymentStatus.paid) {
    return 0;
  }
  const overdueMs = input.now.getTime() - input.dueDate.getTime();
  if (overdueMs <= 0) {
    return 0;
  }
  const daysOverdue = Math.floor(overdueMs / MS_PER_DAY);
  if (daysOverdue <= 0) {
    return 0;
  }
  const rate = toNumber(input.penaltyRatePercentPerDay) / 100;
  return round2(input.total * rate * daysOverdue);
}

// «Просрочен» — вычисляемый флаг, не хранимый статус.
export function isOverdue(
  bill: {
    stage: BillStage;
    paymentStatus: BillPaymentStatus | null;
    dueDate: Date;
  },
  now: Date,
): boolean {
  return (
    bill.stage === BillStage.final &&
    (bill.paymentStatus === BillPaymentStatus.pending ||
      bill.paymentStatus === BillPaymentStatus.payment_claimed) &&
    now.getTime() > bill.dueDate.getTime()
  );
}
