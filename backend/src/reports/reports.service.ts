import { Injectable } from '@nestjs/common';
import { BillPaymentStatus, BillStage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { billTotal, computeAccruedPenalty, toNumber, round2 } from '../billing/billing.util';

const DAY = 24 * 60 * 60 * 1000;

export interface OverdueEntry {
  billId: string;
  leaseId: string;
  propertyAddress: string;
  tenantEmail: string | null;
  dueDate: Date;
  daysOverdue: number;
  totalDue: number;
}

export interface ExpiringLease {
  leaseId: string;
  propertyAddress: string;
  endDate: Date;
  daysUntilEnd: number;
}

export interface LandlordSummary {
  income: { total: number; byMonth: Array<{ month: string; amount: number }> };
  outstanding: { totalDue: number; overdue: OverdueEntry[] };
  leaseExpirations: {
    within30: number;
    within60: number;
    within90: number;
    expiringSoon: ExpiringLease[];
  };
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLandlordSummary(landlordId: string): Promise<LandlordSummary> {
    const leases = await this.prisma.lease.findMany({
      where: { landlordId },
      include: {
        property: { select: { address: true } },
        tenant: { select: { email: true } },
        bills: { include: { lineItems: true, payment: true } },
      },
    });

    const now = new Date();
    const byMonth = new Map<string, number>();
    let incomeTotal = 0;
    let outstandingTotal = 0;
    const overdue: OverdueEntry[] = [];
    const expiringSoon: ExpiringLease[] = [];
    let within30 = 0;
    let within60 = 0;
    let within90 = 0;

    for (const lease of leases) {
      for (const bill of lease.bills) {
        // Доходы — по подтверждённым платежам.
        if (bill.payment) {
          const amount = toNumber(bill.payment.amount);
          incomeTotal += amount;
          const key = monthKey(bill.payment.confirmedAt);
          byMonth.set(key, round2((byMonth.get(key) ?? 0) + amount));
        }

        // Задолженность — финальные неоплаченные счета.
        const unpaid =
          bill.stage === BillStage.final &&
          bill.paymentStatus !== BillPaymentStatus.paid;
        if (unpaid) {
          const total = billTotal(bill.lineItems);
          const penalty = bill.penaltyWaived
            ? 0
            : computeAccruedPenalty({
                total,
                penaltyRatePercentPerDay: bill.penaltyRatePercentPerDay,
                dueDate: bill.dueDate,
                now,
                stage: bill.stage,
                paymentStatus: bill.paymentStatus,
                penaltyWaived: bill.penaltyWaived,
                penaltyWaivedAmount: bill.penaltyWaivedAmount,
              });
          const totalDue = round2(total + penalty);
          outstandingTotal += totalDue;
          if (now.getTime() > bill.dueDate.getTime()) {
            overdue.push({
              billId: bill.id,
              leaseId: lease.id,
              propertyAddress: lease.property.address,
              tenantEmail: lease.tenant?.email ?? null,
              dueDate: bill.dueDate,
              daysOverdue: Math.floor(
                (now.getTime() - bill.dueDate.getTime()) / DAY,
              ),
              totalDue,
            });
          }
        }
      }

      // Сроки договоров — истекающие в ближайшие 90 дней.
      const daysUntilEnd = Math.ceil(
        (lease.endDate.getTime() - now.getTime()) / DAY,
      );
      if (daysUntilEnd >= 0 && daysUntilEnd <= 90) {
        expiringSoon.push({
          leaseId: lease.id,
          propertyAddress: lease.property.address,
          endDate: lease.endDate,
          daysUntilEnd,
        });
        if (daysUntilEnd <= 30) within30 += 1;
        if (daysUntilEnd <= 60) within60 += 1;
        within90 += 1;
      }
    }

    return {
      income: {
        total: round2(incomeTotal),
        byMonth: [...byMonth.entries()]
          .map(([month, amount]) => ({ month, amount }))
          .sort((a, b) => a.month.localeCompare(b.month)),
      },
      outstanding: {
        totalDue: round2(outstandingTotal),
        overdue: overdue.sort((a, b) => b.daysOverdue - a.daysOverdue),
      },
      leaseExpirations: {
        within30,
        within60,
        within90,
        expiringSoon: expiringSoon.sort(
          (a, b) => a.daysUntilEnd - b.daysUntilEnd,
        ),
      },
    };
  }
}

function monthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
