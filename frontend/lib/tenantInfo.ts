import { apiFetch, ApiError } from './api';

export interface TenantInfo {
  passportSeries: string;
  passportNumber: string;
  passportIssuedBy: string;
  birthDate: string;
  registrationAddress: string;
  phone?: string;
}

// Возвращает null, если данные ещё не заполнены (404).
export async function getTenantInfo(
  leaseId: string,
): Promise<TenantInfo | null> {
  try {
    return await apiFetch<TenantInfo>(`/leases/${leaseId}/tenant-info`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function putTenantInfo(
  leaseId: string,
  data: TenantInfo,
): Promise<unknown> {
  return apiFetch(`/leases/${leaseId}/tenant-info`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
