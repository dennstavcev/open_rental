import { apiFetch } from './api';

export interface Property {
  id: string;
  address: string;
  city: string | null;
  street: string | null;
  house: string | null;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  cadastralNumber: string | null;
  propertyType: string;
  areaSqm: number | null;
  description: string | null;
  timezone: string;
}

export interface CreatePropertyInput {
  city: string;
  street: string;
  house: string;
  building?: string;
  floor?: string;
  apartment?: string;
  cadastralNumber?: string;
  propertyType: string;
  areaSqm?: number;
  description?: string;
}

export interface UpdatePropertyInput {
  city?: string;
  street?: string;
  house?: string;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
  cadastralNumber?: string | null;
  propertyType?: string;
  areaSqm?: number;
  description?: string;
}

export interface PropertyLeaseHistoryEntry {
  leaseId: string;
  startDate: string;
  endDate: string;
  effectiveEndDate: string | null;
  tenantEmail: string | null;
  monthlyRent: number;
  payments: {
    finalBills: number;
    paidOnTime: number;
    paidLate: number;
    unpaid: number;
  };
}

export function listProperties(): Promise<Property[]> {
  return apiFetch<Property[]>('/properties');
}

export function createProperty(input: CreatePropertyInput): Promise<Property> {
  return apiFetch<Property>('/properties', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getProperty(id: string): Promise<Property> {
  return apiFetch<Property>(`/properties/${id}`);
}

export function getPropertyLeaseHistory(
  id: string,
): Promise<PropertyLeaseHistoryEntry[]> {
  return apiFetch<PropertyLeaseHistoryEntry[]>(
    `/properties/${id}/lease-history`,
  );
}

export function updateProperty(
  id: string,
  input: UpdatePropertyInput,
): Promise<Property> {
  return apiFetch<Property>(`/properties/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
