'use client';

import { forwardRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const Overlay = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=closed]:animate-out ' +
        'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
      className,
    )}
    {...props}
  />
));
Overlay.displayName = 'DialogOverlay';

/**
 * Одна и та же сущность в двух ролях: на мобильном выезжает снизу
 * (sheet), на десктопе — модальное окно по центру. Это поверхность, где
 * элевация оправдана, поэтому здесь карточка уместна.
 */
export const DialogContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string }
>(({ className, children, title, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <Overlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 flex flex-col gap-4 border border-line bg-surface-raised shadow-raised',
        'inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-lg p-5 pb-8',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
        'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-form',
        'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:pb-5',
        'sm:data-[state=open]:slide-in-from-bottom-2 sm:data-[state=closed]:slide-out-to-bottom-2',
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-4">
        <DialogPrimitive.Title className="text-xl font-bold text-content">
          {title}
        </DialogPrimitive.Title>
        <DialogPrimitive.Close
          aria-label="Закрыть"
          className="rounded-pill p-1 text-content-muted transition duration-fast hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <X className="size-5" />
        </DialogPrimitive.Close>
      </div>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap justify-end gap-3 pt-2', className)} {...props} />;
}
