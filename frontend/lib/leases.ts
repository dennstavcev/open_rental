import { apiFetch } from './api';

export type LeaseStatus = 'draft' | 'sent' | 'active' | 'terminated';

export interface Lease {
  id: string;
  propertyId: string;
  landlordId: string;
  tenantId: string | null;
  status: LeaseStatus;
  startDate: string;
  endDate: string;
  rentAmount: string;
  depositAmount: string;
  paymentDay: number;
  penaltyRatePercentPerDay: string;
}

export interface CreateLeaseInput {
  startDate: string;
  endDate: string;
  rentAmount: number;
  depositAmount: number;
  paymentDay: number;
  penaltyRatePercentPerDay: number;
}

export interface Invitation {
  id: string;
  leaseId: string;
  invitedEmail: string;
  status: 'pending' | 'accepted' | 'declined';
  // Контекст приглашения: кто позвал и на какой объект/условия — свой
  // собственный email приглашённому ни о чём не говорит.
  landlord: { fullName: string; email: string };
  property: { address: string };
  lease: { startDate: string; endDate: string; rentAmount: string };
}

export function listLeases(): Promise<Lease[]> {
  return apiFetch<Lease[]>('/leases');
}

export function getLease(id: string): Promise<Lease> {
  return apiFetch<Lease>(`/leases/${id}`);
}

export function createLease(
  propertyId: string,
  input: CreateLeaseInput,
): Promise<Lease> {
  return apiFetch<Lease>(`/properties/${propertyId}/leases`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function sendLease(id: string, invitedEmail: string): Promise<unknown> {
  return apiFetch(`/leases/${id}/send`, {
    method: 'POST',
    body: JSON.stringify({ invitedEmail }),
  });
}

export function listInvitations(): Promise<Invitation[]> {
  return apiFetch<Invitation[]>('/invitations');
}

export function acceptInvitation(id: string): Promise<unknown> {
  return apiFetch(`/invitations/${id}/accept`, { method: 'POST' });
}

export function declineInvitation(id: string): Promise<unknown> {
  return apiFetch(`/invitations/${id}/decline`, { method: 'POST' });
}

export interface LeaseDocument {
  id: string;
  version: number;
  format: string;
  content: string;
  createdAt: string;
}

export interface LeaseSignedScan {
  id: string;
  role: 'landlord' | 'tenant';
  mimeType: string;
  confirmedAt: string;
}

export function generateDocument(id: string): Promise<LeaseDocument> {
  return apiFetch<LeaseDocument>(`/leases/${id}/document`, { method: 'POST' });
}

export function getDocument(id: string): Promise<LeaseDocument> {
  return apiFetch<LeaseDocument>(`/leases/${id}/document`);
}

export function listSignedScans(id: string): Promise<LeaseSignedScan[]> {
  return apiFetch<LeaseSignedScan[]>(`/leases/${id}/signed-scans`);
}

export function uploadSignedScan(
  id: string,
  file: File,
): Promise<{ activated: boolean; lease: Lease }> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch(`/leases/${id}/signed-scans`, {
    method: 'POST',
    body: form,
  });
}

// Дата окончания по умолчанию: +11 месяцев от даты начала (типовой срок
// аренды в РФ — до года, чтобы не требовать регистрации договора).
export function addElevenMonths(startDate: string): string {
  const [year, month, day] = startDate.split('-').map(Number);
  const totalMonths = year * 12 + (month - 1) + 11;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const d = Math.min(day, daysInMonth);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export const STATUS_LABEL: Record<LeaseStatus, string> = {
  draft: 'Черновик',
  sent: 'Отправлен',
  active: 'Действует',
  terminated: 'Расторгнут',
};
