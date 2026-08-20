import { apiFetch } from './api';

export interface PrivacyPolicy {
  version: string;
  updatedAt: string;
  html: string;
}

export function getPrivacyPolicy(): Promise<PrivacyPolicy> {
  return apiFetch<PrivacyPolicy>('/legal/privacy-policy');
}
