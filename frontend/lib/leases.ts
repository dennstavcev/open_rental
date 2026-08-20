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

// Реквизиты арендодателя по договору (ADR-0019): арендатору — куда платить,
// арендодателю — что увидит арендатор.
export interface PayoutDetails {
  payoutPhone: string | null;
  payoutBankName: string | null;
  payoutNote: string | null;
  filled: boolean;
}

export function getPayoutDetails(leaseId: string): Promise<PayoutDetails> {
  return apiFetch<PayoutDetails>(`/leases/${leaseId}/payout-details`);
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

// Опись имущества, передаваемого с помещением (ADR-0018) — из неё
// рендерится Приложение №1 «Акт приёма-передачи имущества». Правит только
// собственник и только пока договор — черновик; список видят обе стороны.
export interface LeaseInventoryItem {
  id: string;
  leaseId: string;
  type: string;
  brand: string | null;
  model: string | null;
  quantity: number;
}

export interface InventoryItemInput {
  type: string;
  brand?: string;
  model?: string;
  quantity?: number;
}

export function listInventoryItems(
  leaseId: string,
): Promise<LeaseInventoryItem[]> {
  return apiFetch<LeaseInventoryItem[]>(`/leases/${leaseId}/inventory-items`);
}

export function createInventoryItem(
  leaseId: string,
  input: InventoryItemInput,
): Promise<LeaseInventoryItem> {
  return apiFetch<LeaseInventoryItem>(`/leases/${leaseId}/inventory-items`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateInventoryItem(
  leaseId: string,
  itemId: string,
  input: InventoryItemInput,
): Promise<LeaseInventoryItem> {
  return apiFetch<LeaseInventoryItem>(
    `/leases/${leaseId}/inventory-items/${itemId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

export function deleteInventoryItem(
  leaseId: string,
  itemId: string,
): Promise<unknown> {
  return apiFetch(`/leases/${leaseId}/inventory-items/${itemId}`, {
    method: 'DELETE',
  });
}

// Приложение №1 — акт приёма-передачи имущества (ADR-0018). Версионируется
// отдельно от текста договора.
export function generateHandoverAct(id: string): Promise<LeaseDocument> {
  return apiFetch<LeaseDocument>(`/leases/${id}/document/handover-act`, {
    method: 'POST',
  });
}

export function getHandoverAct(id: string): Promise<LeaseDocument> {
  return apiFetch<LeaseDocument>(`/leases/${id}/document/handover-act`);
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
