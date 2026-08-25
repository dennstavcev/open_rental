import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from './Logo';

/**
 * Общая раскладка экранов до входа. Контекст (фото на мобильном, тёплый
 * градиент на десктопе) задаётся классом `.auth-shell` в globals.css —
 * он подменяет токены, поэтому содержимое здесь одно и то же для обеих
 * раскладок и не дублируется.
 *
 * Навигации приложения тут нет: пользователь ещё не вошёл.
 */
export function AuthLayout({ back, children }: { back: string; children: React.ReactNode }) {
  return (
    <div data-app className="auth-shell flex flex-col">
      <div className="p-4">
        <Link
          href={back}
          aria-label="Назад"
          className="inline-flex size-10 items-center justify-center rounded-pill border border-line text-content transition-colors duration-fast hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <ArrowLeft aria-hidden className="size-5" />
        </Link>
      </div>

      {/* На мобильном форма прижата к низу — под большой палец; на
          десктопе центрирована в узкой колонке. */}
      <div className="flex flex-1 flex-col justify-end px-5 pb-10 lg:justify-center lg:px-6 lg:pb-16">
        <div className="mx-auto w-full max-w-form lg:rounded-lg lg:border lg:border-line lg:bg-surface lg:p-8 lg:shadow-raised">
          {/* Лок-ап целиком — это брендовый момент, а не служебная
              шапка: слоган здесь уместен. На фото он читается за счёт
              светлой подложки самого знака. */}
          <Logo variant="lockup" className="w-40 lg:w-44" />
          {children}
        </div>
      </div>
    </div>
  );
}
