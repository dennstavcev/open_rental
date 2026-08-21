'use client';

import { forwardRef } from 'react';
import { cn } from './cn';

/**
 * Карточка — точечный инструмент, а не обёртка вокруг каждого блока:
 * hero-сводка, sheet, единственное действие экрана. Для списков и таблиц
 * используются плоские поверхности с разделителями (см. `List`, `Table`).
 */
export const Card = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-md border border-line bg-surface shadow-raised',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center justify-between gap-3 px-5 pt-5', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2 ref={ref} className={cn('text-lg font-bold text-content', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

export const CardBody = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5', className)} {...props} />
  ),
);
CardBody.displayName = 'CardBody';
