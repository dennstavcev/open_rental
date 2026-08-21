import { cn } from './ui/cn';

/**
 * Секция — плоская поверхность с заголовком и действием, а не карточка:
 * карточками оборачивается только то, где элевация действительно нужна.
 */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mt-8 first:mt-0', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-bold text-content">{title}</h2>
        {action && <div className="shrink-0 text-sm">{action}</div>}
      </div>
      {children}
    </section>
  );
}
