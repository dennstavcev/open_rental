import { apiFetch } from './api';

export type MaintenanceStatus = 'open' | 'in_progress' | 'resolved';
export type SettlementPayer = 'tenant' | 'owner' | 'split';

export interface MaintenanceRequest {
  id: string;
  category: string;
  description: string;
  status: MaintenanceStatus;
  settlementAmount: string | null;
  settlementPayer: SettlementPayer | null;
  confirmedByTenant: boolean;
  confirmedByLandlord: boolean;
  settlementAppliedAt: string | null;
}

export const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  open: 'Открыта',
  in_progress: 'В работе',
  resolved: 'Решена',
};

export const PAYER_LABEL: Record<SettlementPayer, string> = {
  tenant: 'Арендатор',
  owner: 'Собственник',
  split: 'Пополам',
};

export function listRequests(leaseId: string): Promise<MaintenanceRequest[]> {
  return apiFetch<MaintenanceRequest[]>(
    `/leases/${leaseId}/maintenance-requests`,
  );
}

export function createRequest(
  leaseId: string,
  category: string,
  description: string,
  photo?: File,
): Promise<MaintenanceRequest> {
  const form = new FormData();
  form.append('category', category);
  form.append('description', description);
  if (photo) form.append('photo', photo);
  return apiFetch(`/leases/${leaseId}/maintenance-requests`, {
    method: 'POST',
    body: form,
  });
}

export function updateStatus(
  id: string,
  status: MaintenanceStatus,
): Promise<MaintenanceRequest> {
  return apiFetch(`/maintenance-requests/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function proposeSettlement(
  id: string,
  amount: number,
  payer: SettlementPayer,
): Promise<MaintenanceRequest> {
  return apiFetch(`/maintenance-requests/${id}/settlement`, {
    method: 'POST',
    body: JSON.stringify({ amount, payer }),
  });
}

export function confirmSettlement(id: string): Promise<MaintenanceRequest> {
  return apiFetch(`/maintenance-requests/${id}/settlement/confirm`, {
    method: 'POST',
  });
}
