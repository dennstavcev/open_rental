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
  iconTone = 'neutral',
  title,
  subtitle,
  value,
  href,
  onClick,
  className,
}: {
  icon?: LucideIcon;
  /**
   * По умолчанию иконка строки нейтральная: фиолетовый и функциональные
   * цвета на ярлыке-принадлежности читались бы как ложный статус.
   * Тон задаётся только там, где иконка И ЕСТЬ состояние — например
   * «данные внесены / ожидаются» у стороны договора.
   */
  iconTone?: 'neutral' | 'success' | 'warn' | 'danger';
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
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-md',
            {
              neutral: 'bg-surface-icon text-content-secondary',
              success: 'bg-success-weak text-success',
              warn: 'bg-warn-weak text-warn',
              danger: 'bg-danger-weak text-danger',
            }[iconTone],
          )}
        >
          <Icon aria-hidden className="size-5" />
        </span>
      )}
      {/* Заголовок переносится, а не обрезается: на мобильном адрес
          объекта длиннее строки почти всегда, а «ул. Ленина, 15, …»
          вместо адреса — потеря того самого, ради чего строка нужна. */}
      <span className="min-w-0 flex-1">
        <span className="block break-words font-semibold text-content [overflow-wrap:anywhere]">
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block break-words text-sm text-content-muted">
            {subtitle}
          </span>
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
      'hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset',
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
