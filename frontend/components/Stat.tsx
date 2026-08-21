import { cn } from './ui/cn';

/**
 * Показатель сводки: мелкий лейбл и крупное значение. Данные — самое
 * заметное на экране, поэтому значение набирается крупно и жирно, а не
 * в один размер с окружающим текстом.
 *
 * `tone` выбирается по смыслу числа: деньги к получению — терракотовые,
 * просрочка — danger, остальное — нейтральный ink. Фиолетовый здесь
 * недопустим: это не действие.
 */
export function Stat({
  label,
  value,
  tone = 'ink',
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'ink' | 'money' | 'danger' | 'warn';
  icon?: React.ReactNode;
  className?: string;
}) {
  const toneClass = {
    ink: 'text-content',
    money: 'text-terracotta-500',
    danger: 'text-danger',
    warn: 'text-warn',
  }[tone];

  return (
    <div className={cn('min-w-0 px-5 py-4', className)}>
      <p className="text-xs font-semibold uppercase tracking-label text-content-muted">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 flex items-center gap-2 text-3xl font-bold [font-variant-numeric:tabular-nums] lg:text-4xl',
          toneClass,
        )}
      >
        {icon}
        {value}
      </p>
    </div>
  );
}

/** Ряд показателей: на десктопе в строку с вертикальными разделителями,
 *  на мобильном — в столбик с горизонтальными. */
export function StatRow({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'grid divide-y divide-line rounded-md border border-line bg-surface',
        'sm:grid-flow-col sm:auto-cols-fr sm:divide-x sm:divide-y-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
