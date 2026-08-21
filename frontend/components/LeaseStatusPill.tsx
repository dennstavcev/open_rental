import { StatusPill } from './StatusPill';
import { STATUS_LABEL, type LeaseStatus } from '@/lib/leases';

/** Тон статуса договора в одном месте — чтобы «Действует» не оказался
 *  зелёным на одном экране и нейтральным на другом. */
const TONE: Record<LeaseStatus, 'success' | 'warn' | 'neutral'> = {
  draft: 'neutral',
  sent: 'warn',
  active: 'success',
  terminated: 'neutral',
};

export function LeaseStatusPill({ status }: { status: LeaseStatus }) {
  return <StatusPill tone={TONE[status]}>{STATUS_LABEL[status]}</StatusPill>;
}
