import { apiFetch } from './api';

export type BillStage = 'draft' | 'final';
export type BillPaymentStatus = 'pending' | 'payment_claimed' | 'paid';

export interface BillLineItem {
  id: string;
  kind: string;
  title: string;
  amount: string;
}

export interface Bill {
  id: string;
  stage: BillStage;
  paymentStatus: BillPaymentStatus | null;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  penaltyWaived: boolean;
  lineItems: BillLineItem[];
  payment: { amount: string; confirmedAt: string } | null;
}

export interface BillView {
  bill: Bill;
  total: number;
  accruedPenalty: number;
  totalDue: number;
  overdue: boolean;
}

export function listBills(leaseId: string): Promise<BillView[]> {
  return apiFetch<BillView[]>(`/leases/${leaseId}/bills`);
}

export function addLineItem(
  billId: string,
  input: { title: string; amount: number },
): Promise<BillView> {
  return apiFetch(`/bills/${billId}/line-items`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function finalizeBill(billId: string): Promise<BillView> {
  return apiFetch(`/bills/${billId}/finalize`, { method: 'POST' });
}

export function claimPaid(billId: string): Promise<BillView> {
  return apiFetch(`/bills/${billId}/claim-paid`, { method: 'POST' });
}

export function confirmPaid(billId: string): Promise<BillView> {
  return apiFetch(`/bills/${billId}/confirm-paid`, { method: 'POST' });
}

export function waivePenalty(billId: string): Promise<BillView> {
  return apiFetch(`/bills/${billId}/waive-penalty`, { method: 'POST' });
}

export const PAYMENT_STATUS_LABEL: Record<BillPaymentStatus, string> = {
  pending: 'Ожидается',
  payment_claimed: 'Оплата заявлена',
  paid: 'Оплачен',
};
