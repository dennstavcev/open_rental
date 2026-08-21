'use client';

import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

/**
 * Кнопки капсульные. Фиолетовый градиент — только у `primary`: это
 * единственный холодный акцент системы, и он означает «главное действие»
 * (ADR-0023). Вариант `onPhoto` — для экранов входа поверх фотографии,
 * где первичная кнопка белая, а не фиолетовая.
 */
const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-pill font-semibold whitespace-nowrap ' +
    'transition duration-fast ease-standard select-none ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-app ' +
    'disabled:pointer-events-none disabled:opacity-50 ' +
    '[&_svg]:size-[18px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-content-onAccent hover:-translate-y-px',
        secondary:
          'border border-line-strong text-content hover:bg-surface-hover hover:-translate-y-px',
        ghost: 'text-content-secondary hover:bg-surface-hover',
        link: 'text-violet-500 hover:underline underline-offset-4 rounded-sm',
        danger: 'border border-danger text-danger hover:bg-danger-weak',
        onPhoto: 'bg-white text-ink-950 hover:-translate-y-px',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        md: 'h-11 px-6 text-base',
        lg: 'h-12 px-8 text-md',
        icon: 'h-10 w-10 p-0',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        // Кнопка внутри формы по умолчанию сабмитит — явный тип избавляет
        // от случайных отправок у вспомогательных кнопок.
        type={asChild ? undefined : type ?? 'button'}
        className={cn(button({ variant, size, block }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
