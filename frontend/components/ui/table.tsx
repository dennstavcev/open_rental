import { forwardRef } from 'react';
import { cn } from './cn';

/**
 * Настоящая десктопная таблица: закреплённая шапка, числовые колонки
 * вправо табличными цифрами, разделители вместо теней. На мобильном
 * таблицы не используются — там карточки-строки (`Row`).
 */
export const Table = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-x-auto">
      <table
        ref={ref}
        className={cn('w-full border-collapse text-base', className)}
        {...props}
      />
    </div>
  ),
);
Table.displayName = 'Table';

export const THead = forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn('sticky top-0 z-10 bg-surface-sticky backdrop-blur-md', className)}
    {...props}
  />
));
THead.displayName = 'THead';

export const TH = forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }
>(({ className, numeric, ...props }, ref) => (
  <th
    ref={ref}
    scope="col"
    className={cn(
      'border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-label text-content-muted',
      numeric ? 'text-right' : 'text-left',
      className,
    )}
    {...props}
  />
));
TH.displayName = 'TH';

export const TR = forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b border-line transition-colors duration-fast last:border-b-0 hover:bg-surface-hover',
      className,
    )}
    {...props}
  />
));
TR.displayName = 'TR';

export const TD = forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }
>(({ className, numeric, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'px-3 py-3 align-middle text-content',
      numeric && 'text-right [font-variant-numeric:tabular-nums]',
      className,
    )}
    {...props}
  />
));
TD.displayName = 'TD';
