import { apiFetch } from './api';

export interface LandlordSummary {
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
