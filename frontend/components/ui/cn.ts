import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Живёт здесь, а не в `lib/`: `frontend/lib/*` — контракт с backend, он
 * редизайном не трогается (ADR-0023).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
