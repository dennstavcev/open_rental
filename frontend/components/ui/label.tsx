'use client';

import { forwardRef } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from './cn';

/** Лейбл поля: мелкий, в верхнем регистре, с широким трекингом — паттерн
 *  бейзлайна, который себя оправдал и сохранён при редизайне. */
export const Label = forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'block text-xs font-semibold uppercase tracking-label text-content-muted',
      className,
    )}
    {...props}
  />
));
Label.displayName = 'Label';
