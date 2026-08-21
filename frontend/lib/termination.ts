import { apiFetch } from './api';

export type TerminationStatus = 'pending' | 'finalized' | 'cancelled';

export interface TerminationRequest {
  id: string;
  requestedTerminationDate: string;
  reason: string | null;
  status: TerminationStatus;
  periodEndOverride: string | null;
}

export const TERMINATION_STATUS_LABEL: Record<TerminationStatus, string> = {
  pending: 'Ожидает решения',
  finalized: 'Расторгнут',
  cancelled: 'Отменена',
};

export function listTerminations(
  leaseId: string,
): Promise<TerminationRequest[]> {
  return apiFetch<TerminationRequest[]>(
    `/leases/${leaseId}/termination-requests`,
  );
}

export function createTermination(
  leaseId: string,
  requestedTerminationDate: string,
  reason?: string,
): Promise<TerminationRequest> {
  return apiFetch(`/leases/${leaseId}/termination-requests`, {
    method: 'POST',
    body: JSON.stringify({ requestedTerminationDate, reason }),
  });
}

export function finalizeTermination(
  id: string,
  input: { periodEndOverride?: string; depositReturnAmount?: number },
): Promise<TerminationRequest> {
  return apiFetch(`/termination-requests/${id}/finalize`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
