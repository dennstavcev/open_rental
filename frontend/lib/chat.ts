import { apiFetch, apiFetchBlob } from './api';

export interface Message {
  id: string;
  senderId: string;
  body: string;
  isOfficial: boolean;
  editedAt: string | null;
  createdAt: string;
  attachmentStorageKey: string | null;
  attachmentName: string | null;
}

export function listMessages(leaseId: string): Promise<Message[]> {
  return apiFetch<Message[]>(`/leases/${leaseId}/messages`);
}

export function sendMessage(
  leaseId: string,
  body: string,
  isOfficial: boolean,
  attachment?: File,
): Promise<Message> {
  const form = new FormData();
  form.append('body', body);
  form.append('isOfficial', String(isOfficial));
  if (attachment) form.append('attachment', attachment);
  return apiFetch(`/leases/${leaseId}/messages`, {
    method: 'POST',
    body: form,
  });
}

export async function openAttachment(messageId: string): Promise<void> {
  const blob = await apiFetchBlob(`/messages/${messageId}/attachment`);
  window.open(URL.createObjectURL(blob), '_blank');
}
