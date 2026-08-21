'use client';

import { forwardRef } from 'react';
import { cn } from './cn';

const base =
  'w-full rounded-pill border bg-surface-input px-5 text-base text-content ' +
  'placeholder:text-content-muted transition duration-fast ease-standard ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:border-violet-500 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed ' +
  '[font-variant-numeric:tabular-nums]';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(base, 'h-11', invalid ? 'border-danger' : 'border-line', className)}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** Многострочное поле — прямоугольное со скруглением md: капсула на
 *  нескольких строках выглядит сломанной. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        base,
        'rounded-md py-3 leading-relaxed',
        invalid ? 'border-danger' : 'border-line',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
