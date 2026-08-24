import { apiFetch } from './api';

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
  outstanding: {
    totalDue: number;
    overdue: Array<{
      billId: string;
      leaseId: string;
      propertyAddress: string;
      tenantEmail: string | null;
      dueDate: string;
      daysOverdue: number;
      totalDue: number;
    }>;
  };
  leaseExpirations: {
    within30: number;
    within60: number;
    within90: number;
    expiringSoon: Array<{
      leaseId: string;
      propertyAddress: string;
      endDate: string;
      daysUntilEnd: number;
    }>;
  };
}

export function getSummary(): Promise<LandlordSummary> {
  return apiFetch<LandlordSummary>('/reports/summary');
}
