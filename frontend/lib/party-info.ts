import { apiFetch } from './api';

export interface PartyInfo {
  passportSeries: string;
  passportNumber: string;
  passportIssuedBy: string;
  birthDate: string;
  registrationAddress: string;
  phone?: string;
}

export interface PartyInfoView extends PartyInfo {
  consentAcceptedAt: string | null;
  consentPolicyVersion: string | null;
  currentPolicyVersion: string;
  updatedAt: string;
}

export interface PartyInfoStatus {
  role: 'landlord' | 'tenant';
  currentPolicyVersion: string;
  self: {
    filled: boolean;
    updatedAt: string | null;
    needsConsent: boolean;
  };
  counterparty: {
    filled: boolean;
    updatedAt: string | null;
  };
}

export interface SavePartyInfoInput extends PartyInfo {
  consentAccepted?: boolean;
  policyVersion?: string;
}

export function getOwnPartyInfo(leaseId: string): Promise<PartyInfoView> {
  return apiFetch<PartyInfoView>(`/leases/${leaseId}/party-info`);
}

export function savePartyInfo(
  leaseId: string,
  input: SavePartyInfoInput,
): Promise<{ leaseId: string; role: 'landlord' | 'tenant' }> {
  return apiFetch(`/leases/${leaseId}/party-info`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function getPartyInfoStatus(
  leaseId: string,
): Promise<PartyInfoStatus> {
  return apiFetch<PartyInfoStatus>(`/leases/${leaseId}/party-info/status`);
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  return raw.trim();
}

export function formatDateRu(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}
