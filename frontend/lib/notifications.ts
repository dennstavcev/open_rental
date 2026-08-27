import { apiFetch } from './api';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  leaseId: string | null;
  readAt: string | null;
  createdAt: string;
}

export function listNotifications(): Promise<Notification[]> {
  return apiFetch<Notification[]>('/notifications');
}

export function markRead(id: string): Promise<Notification> {
  return apiFetch(`/notifications/${id}/read`, { method: 'POST' });
}

export function markLeaseRead(
  leaseId: string,
  type: string,
): Promise<{ count: number }> {
  return apiFetch('/notifications/read', {
    method: 'POST',
    body: JSON.stringify({ leaseId, type }),
  });
}
