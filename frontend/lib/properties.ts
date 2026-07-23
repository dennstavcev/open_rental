import { apiFetch } from './api';

export interface Property {
  id: string;
  address: string;
  propertyType: string;
  areaSqm: number | null;
  description: string | null;
  timezone: string;
}

export interface CreatePropertyInput {
  address: string;
  propertyType: string;
  areaSqm?: number;
  description?: string;
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
