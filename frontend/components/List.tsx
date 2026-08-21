import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { cn } from './ui/cn';

/** Плоский список с разделителями — мобильный эквивалент таблицы. */
export function List({ className, children }: { className?: string; children: React.ReactNode }) {
  return <ul className={cn('divide-y divide-line border-y border-line', className)}>{children}</ul>;
}

/**
 * Строка списка: слева нейтральная иконка принадлежности, в центре
 * заголовок с подписью, справа — ключевое значение. Данные стоят справа
 * крупным весом, а не в хвосте строки мелким текстом.
 *
 * Иконка строки намеренно нейтральная: фиолетовый в системе означает
 * «здесь действие», и на иконке-ярлыке он читался бы как ложное обещание.
 */
export function Row({
  icon: Icon,
  title,
  subtitle,
  value,
  href,
  onClick,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const interactive = Boolean(href || onClick);
  const body = (
    <>
      {Icon && (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-icon text-content-secondary">
          <Icon aria-hidden className="size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-content">{title}</span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-sm text-content-muted">{subtitle}</span>
        )}
      </span>
      {value && <span className="shrink-0 text-right">{value}</span>}
      {interactive && (
        <ChevronRight aria-hidden className="size-5 shrink-0 text-content-muted" />
      )}
    </>
  );

  const shared = cn(
    'flex w-full items-center gap-4 px-1 py-4 text-left transition-colors duration-fast',
    interactive &&
      'hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-inset',
    className,
  );

  return (
    <li>
      {href ? (
        <Link href={href} className={shared}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={shared}>
          {body}
        </button>
      ) : (
        <div className={shared}>{body}</div>
      )}
    </li>
  );
}
