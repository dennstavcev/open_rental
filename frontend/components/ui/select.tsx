'use client';

import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

/**
 * Нативный `<select>` вместо радиксового: списки здесь короткие и
 * фиксированные (тип объекта, тип счётчика, кто платит), а нативный
 * контрол на телефоне открывает системный барабан — для «~90% с
 * телефона» это лучше кастомного выпадающего меню.
 */
export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        'h-11 w-full appearance-none rounded-pill border border-line bg-surface-input pl-5 pr-11',
        'text-base text-content transition duration-fast ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:border-violet-500',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden
      className="pointer-events-none absolute right-4 top-1/2 size-[18px] -translate-y-1/2 text-content-muted"
    />
  </div>
));
Select.displayName = 'Select';
