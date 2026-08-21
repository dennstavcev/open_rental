import { cn } from './cn';

/**
 * Заглушка загрузки. Скелетон должен повторять форму итогового содержимого,
 * а не показывать общие полоски — поэтому это примитив, из которого
 * собирается скелетон конкретного экрана, а не универсальный «спиннер».
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-pill bg-surface-skeleton', className)}
      {...props}
    />
  );
}
