'use client';

import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { cn } from './ui/cn';

/** Сегментированный переключатель фильтра. Выбранный сегмент —
 *  акцентный: это активное состояние управления, а не декор. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={ariaLabel}
      // Radix отдаёт пустую строку при повторном клике по активному
      // сегменту — фильтр не должен уметь «ничего не выбрано».
      onValueChange={(next) => next && onChange(next as T)}
      className={cn('inline-flex rounded-pill border border-line bg-surface p-1', className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            'rounded-pill px-4 py-1.5 text-sm font-medium text-content-secondary',
            'transition duration-fast ease-standard hover:bg-surface-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
            'data-[state=on]:bg-violet-500 data-[state=on]:text-content-onAccent data-[state=on]:hover:bg-violet-500',
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
