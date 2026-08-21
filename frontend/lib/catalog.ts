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
  serialNumber: string | null;
  tariff: string;
  isActive: boolean;
  initialReading: string;
  // Дата метрологической поверки — информационно (ADR-0015).
  calibrationDueDate: string | null;
  // Последнее показание или initialReading, если показаний ещё не было
  // (ADR-0014) — вычисляется бэкендом, не хранится отдельно.
  lastReadingValue: number;
  // Подано ли показание в текущем расчётном периоде — только у
  // счётчиков, полученных через listMetersForLease (ADR-0015).
  currentPeriodSubmitted?: boolean;
}

export interface ReadingResult {
  reading: { id: string; value: string };
  consumption: number;
  cost: number;
  warning: string | null;
}

export interface MeterReading {
  id: string;
  value: string;
  readingDate: string;
  createdAt: string;
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

export const METER_UNIT_LABEL: Record<MeterType, string> = {
  electricity: 'кВт·ч',
  water: 'м³',
  gas: 'м³',
  heating: 'Гкал',
};

// Подсказка тарифа при выборе типа — не влияет на сохранённое значение,
// пользователь может изменить перед сохранением.
export const METER_DEFAULT_TARIFF: Record<MeterType, number> = {
  electricity: 5.5,
  water: 45,
  gas: 8.5,
  heating: 1800,
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
  input: {
    meterType: MeterType;
    name: string;
    serialNumber?: string;
    tariff: number;
    initialReading: number;
    calibrationDueDate?: string;
  },
): Promise<Meter> {
  return apiFetch(`/properties/${propertyId}/meters`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateMeter(
  propertyId: string,
  meterId: string,
  input: Partial<{
    meterType: MeterType;
    name: string;
    serialNumber: string;
    tariff: number;
    isActive: boolean;
    calibrationDueDate: string;
  }>,
): Promise<Meter> {
  return apiFetch(`/properties/${propertyId}/meters/${meterId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export interface LeaseMetersView {
  periodStart: string;
  periodEnd: string;
  meters: Meter[];
}

// Счётчики хаба аренды (ADR-0015) — landlord ИЛИ tenant договора, в
// отличие от listMeters (landlord-only, карточка объекта). Границы
// текущего периода приходят с бэкенда — не дублируем computePeriod.
export function listMetersForLease(leaseId: string): Promise<LeaseMetersView> {
  return apiFetch<LeaseMetersView>(`/leases/${leaseId}/meters`);
}

export function listReadingHistory(meterId: string): Promise<MeterReading[]> {
  return apiFetch<MeterReading[]>(`/meters/${meterId}/readings`);
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
