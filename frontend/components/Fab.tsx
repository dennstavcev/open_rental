'use client';

import { Plus } from 'lucide-react';
import { cn } from './ui/cn';

/** Плавающее действие мобильного списка. Единственная кнопка экрана с
 *  акцентной заливкой — поэтому на экране её ровно одна. */
export function Fab({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'fixed right-5 z-30 flex size-14 items-center justify-center rounded-pill bg-accent text-content-onAccent shadow-raised',
        'bottom-[calc(var(--bottomnav-h)+16px)] transition duration-fast ease-standard hover:-translate-y-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-app',
        'lg:hidden',
        className,
      )}
    >
      <Plus aria-hidden className="size-6" />
    </button>
  );
}
