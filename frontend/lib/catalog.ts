import { apiFetch } from './api';

export type ServiceType = 'monthly' | 'one_time';
export type MeterType = 'electricity' | 'water' | 'gas' | 'heating';

export interface Service {
  id: string;
  name: string;
  price: string;
  serviceType: ServiceType;
  description: string | null;
}

export interface Meter {
  id: string;
  meterType: MeterType;
  name: string;
  tariff: string;
}

export interface ReadingResult {
  reading: { id: string; value: string };
  consumption: number;
  cost: number;
  warning: string | null;
}

export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  monthly: 'Ежемесячная',
  one_time: 'Разовая',
};

export const METER_TYPE_LABEL: Record<MeterType, string> = {
  electricity: 'Электричество',
  water: 'Вода',
  gas: 'Газ',
  heating: 'Отопление',
};

export function listServices(propertyId: string): Promise<Service[]> {
  return apiFetch<Service[]>(`/properties/${propertyId}/services`);
}

export function createService(
  propertyId: string,
  input: { name: string; price: number; serviceType: ServiceType },
): Promise<Service> {
  return apiFetch(`/properties/${propertyId}/services`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listMeters(propertyId: string): Promise<Meter[]> {
  return apiFetch<Meter[]>(`/properties/${propertyId}/meters`);
}

export function createMeter(
  propertyId: string,
  input: { meterType: MeterType; name: string; tariff: number },
): Promise<Meter> {
  return apiFetch(`/properties/${propertyId}/meters`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function submitReading(
  meterId: string,
  confirmedValue: number,
  photo: File,
): Promise<ReadingResult> {
  const form = new FormData();
  form.append('photo', photo);
  form.append('confirmedValue', String(confirmedValue));
  return apiFetch(`/meters/${meterId}/readings`, {
    method: 'POST',
    body: form,
  });
}
