import { LeaseStatus } from '@prisma/client';

export const RETENTION_YEARS = 3; // ГК РФ ст. 196 (ADR-0021).

// Момент, начиная с которого ПДн договора подлежат удалению.
export function retentionExpiryOf(endedAt: Date): Date {
  return new Date(
    Date.UTC(
      endedAt.getUTCFullYear() + RETENTION_YEARS,
      endedAt.getUTCMonth(),
      endedAt.getUTCDate(),
      endedAt.getUTCHours(),
      endedAt.getUTCMinutes(),
      endedAt.getUTCSeconds(),
      endedAt.getUTCMilliseconds(),
    ),
  );
}

export function isRetentionExpired(
  lease: {
    status: LeaseStatus;
    endDate: Date;
    effectiveEndDate: Date | null;
  },
  now: Date = new Date(),
): boolean {
  if (lease.status !== LeaseStatus.terminated) {
    return false;
  }
  const endedAt = lease.effectiveEndDate ?? lease.endDate;
  return now >= retentionExpiryOf(endedAt);
}
