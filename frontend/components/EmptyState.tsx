import type { LucideIcon } from 'lucide-react';
import { cn } from './ui/cn';

/**
 * Пустое состояние всегда предлагает следующее действие. Формулировка
 * «нет данных» без объяснения и выхода — запрещённый паттерн: она
 * оставляет пользователя в тупике.
 */
export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-md border border-line px-6 py-10 text-center',
        className,
      )}
    >
      <Icon aria-hidden className="size-10 text-content-muted" strokeWidth={1.5} />
      <p className="mt-4 text-lg font-bold text-content">{title}</p>
      {text && <p className="mt-1 max-w-prose text-base text-content-muted">{text}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
