import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Ban, Check, Clock, FileText } from 'lucide-react';
import { cn } from './ui/cn';

/**
 * Статус всегда сообщается тремя средствами сразу — цветом, иконкой и
 * текстом. Одним цветом состояние не передаётся никогда: это и требование
 * доступности, и правило дизайн-системы (ADR-0023).
 */
export type StatusTone = 'success' | 'warn' | 'danger' | 'neutral';

const TONE: Record<StatusTone, { className: string; icon: LucideIcon }> = {
  success: { className: 'border-success-line bg-success-weak text-success', icon: Check },
  warn: { className: 'border-warn-line bg-warn-weak text-warn', icon: Clock },
  danger: { className: 'border-danger-line bg-danger-weak text-danger', icon: AlertTriangle },
  neutral: { className: 'border-line bg-surface-icon text-content-secondary', icon: FileText },
};

export function StatusPill({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: StatusTone;
  /** Перебивает иконку тона — например `Ban` у отключённого счётчика. */
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  const { className: toneClass, icon: ToneIcon } = TONE[tone];
  const Icon = icon ?? ToneIcon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-3 py-1 text-xs font-semibold',
        toneClass,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}

export { Ban as DisabledIcon };
