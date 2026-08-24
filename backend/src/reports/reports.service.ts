import { Injectable } from '@nestjs/common';
import {
  BillPaymentStatus,
  BillStage,
  LeaseStatus,
  MaintenanceStatus,
  ServiceType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  billTotal,
  computeAccruedPenalty,
  round2,
  tenantShareForPayer,
  toNumber,
} from '../billing/billing.util';

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

export type PortfolioStatus = 'rented' | 'pending' | 'vacant';

export interface PortfolioEntry {
  propertyId: string;
  address: string;
  city: string | null;
  status: PortfolioStatus;
  tenantEmail: string | null;
  monthlyRent: number | null;
  incomeTotal: number;
  outstandingTotal: number;
  openRequests: number;
  inProgressRequests: number;
  pendingServicesAmount: number;
}

export interface PortfolioTotals {
  properties: number;
  rented: number;
  pending: number;
  vacant: number;
  activeRequests: number;
  pendingServicesAmount: number;
}

export interface LandlordSummary {
  portfolio: { totals: PortfolioTotals; entries: PortfolioEntry[] };
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
      select: {
        id: true,
        propertyId: true,
        startDate: true,
        endDate: true,
        rentAmount: true,
        status: true,
        property: { select: { address: true } },
        tenant: { select: { email: true } },
        bills: { include: { lineItems: true, payment: true } },
      },
    });

    const [properties, requestGroups, pendingServices] = await Promise.all([
      this.prisma.property.findMany({
        where: { ownerId: landlordId },
        select: { id: true, address: true, city: true },
        orderBy: [
          { city: 'asc' },
          { street: 'asc' },
          { house: 'asc' },
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.maintenanceRequest.groupBy({
        by: ['leaseId', 'status'],
        where: {
          status: {
            in: [MaintenanceStatus.open, MaintenanceStatus.in_progress],
          },
          lease: { landlordId },
        },
        _count: { _all: true },
      }),
      this.prisma.service.findMany({
        where: {
          property: { ownerId: landlordId },
          serviceType: ServiceType.one_time,
          billedAt: null,
          // Обе стороны связи проверяются: иначе объект собственника мог бы
          // получить сумму по заявке из чужого договора (ADR-0028).
          sourceRequest: { lease: { landlordId } },
        },
        select: { propertyId: true, price: true, payer: true },
      }),
    ]);

    const now = new Date();
    const byMonth = new Map<string, number>();
    let incomeTotal = 0;
    let outstandingTotal = 0;
    const overdue: OverdueEntry[] = [];
    const expiringSoon: ExpiringLease[] = [];
    let within30 = 0;
    let within60 = 0;
    let within90 = 0;
    const moneyByProperty = new Map<
      string,
      { income: number; outstanding: number }
    >();

    const moneyFor = (propertyId: string) => {
      const existing = moneyByProperty.get(propertyId);
      if (existing) return existing;
      const created = { income: 0, outstanding: 0 };
      moneyByProperty.set(propertyId, created);
      return created;
    };

    for (const lease of leases) {
      const propertyMoney = moneyFor(lease.propertyId);
      for (const bill of lease.bills) {
        // Доходы — по подтверждённым платежам.
        if (bill.payment) {
          const amount = toNumber(bill.payment.amount);
          incomeTotal += amount;
          propertyMoney.income += amount;
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
          propertyMoney.outstanding += totalDue;
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

    const leasesByProperty = new Map<string, typeof leases>();
    const propertyByLease = new Map<string, string>();
    for (const lease of leases) {
      propertyByLease.set(lease.id, lease.propertyId);
      const entries = leasesByProperty.get(lease.propertyId) ?? [];
      entries.push(lease);
      leasesByProperty.set(lease.propertyId, entries);
    }

    const requestsByProperty = new Map<
      string,
      { open: number; inProgress: number }
    >();
    for (const group of requestGroups) {
      const propertyId = propertyByLease.get(group.leaseId);
      if (!propertyId) continue;
      const counts = requestsByProperty.get(propertyId) ?? {
        open: 0,
        inProgress: 0,
      };
      if (group.status === MaintenanceStatus.open) {
        counts.open += group._count._all;
      } else if (group.status === MaintenanceStatus.in_progress) {
        counts.inProgress += group._count._all;
      }
      requestsByProperty.set(propertyId, counts);
    }

    const servicesByProperty = new Map<string, number>();
    for (const service of pendingServices) {
      const current = servicesByProperty.get(service.propertyId) ?? 0;
      servicesByProperty.set(
        service.propertyId,
        round2(current + tenantShareForPayer(service.price, service.payer)),
      );
    }

    const entries: PortfolioEntry[] = properties.map((property) => {
      const propertyLeases = leasesByProperty.get(property.id) ?? [];
      const activeLease = propertyLeases
        .filter((lease) => lease.status === LeaseStatus.active)
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];
      const status: PortfolioStatus = activeLease
        ? 'rented'
        : propertyLeases.some(
              (lease) =>
                lease.status === LeaseStatus.draft ||
                lease.status === LeaseStatus.sent,
            )
          ? 'pending'
          : 'vacant';
      const money = moneyByProperty.get(property.id) ?? {
        income: 0,
        outstanding: 0,
      };
      const requests = requestsByProperty.get(property.id) ?? {
        open: 0,
        inProgress: 0,
      };

      return {
        propertyId: property.id,
        address: property.address,
        city: property.city,
        status,
        tenantEmail: activeLease?.tenant?.email ?? null,
        monthlyRent: activeLease ? toNumber(activeLease.rentAmount) : null,
        incomeTotal: round2(money.income),
        outstandingTotal: round2(money.outstanding),
        openRequests: requests.open,
        inProgressRequests: requests.inProgress,
        pendingServicesAmount: round2(
          servicesByProperty.get(property.id) ?? 0,
        ),
      };
    });

    const portfolioTotals = entries.reduce<PortfolioTotals>(
      (totals, entry) => {
        totals[entry.status] += 1;
        totals.activeRequests += entry.openRequests + entry.inProgressRequests;
        totals.pendingServicesAmount = round2(
          totals.pendingServicesAmount + entry.pendingServicesAmount,
        );
        return totals;
      },
      {
        properties: entries.length,
        rented: 0,
        pending: 0,
        vacant: 0,
        activeRequests: 0,
        pendingServicesAmount: 0,
      },
    );

    return {
      portfolio: { totals: portfolioTotals, entries },
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
