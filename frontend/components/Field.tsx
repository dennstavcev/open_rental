import { useId } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Label } from './ui/label';
import { cn } from './ui/cn';

/**
 * Поле формы: лейбл сверху, подсказка и ошибка снизу. Ошибка сопровождается
 * иконкой и текстом — красной обводки одной недостаточно.
 */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: (props: { id: string; invalid: boolean }) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, invalid: Boolean(error) })}
      {error ? (
        <p className="flex items-center gap-1.5 text-sm text-danger">
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      ) : (
        hint && <p className="text-sm text-content-muted">{hint}</p>
      )}
    </div>
  );
}
