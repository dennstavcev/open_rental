import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from './ui/cn';

/**
 * Шапка экрана: хлебная крошка, крупный заголовок, подпись и слот
 * действия справа. Иерархия задаётся размером и весом, поэтому заголовок
 * здесь заметно крупнее, чем в прежней версии.
 */
export function PageHeader({
  title,
  subtitle,
  back,
  backLabel = 'Назад',
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: string;
  backLabel?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6', className)}>
      {back && (
        <Link
          href={back}
          className="mb-2 inline-flex items-center gap-1.5 rounded-sm text-sm text-content-muted transition-colors duration-fast hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-content lg:text-4xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 max-w-prose text-base text-content-muted">{subtitle}</p>
          )}
        </div>
        {action && <div className="flex shrink-0 items-center gap-3">{action}</div>}
      </div>
    </header>
  );
}
