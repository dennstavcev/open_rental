'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { getPrivacyPolicy, PrivacyPolicy } from '@/lib/legal';
import { formatDateRu } from '@/lib/party-info';

/**
 * Публичная страница: навигации приложения тут нет, пользователь может
 * быть не авторизован. Текст живёт в узкой колонке — мера строки важнее
 * ширины окна, это документ для чтения.
 */
export default function PrivacyPolicyPage() {
  const [policy, setPolicy] = useState<PrivacyPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPrivacyPolicy()
      .then(setPolicy)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Ошибка загрузки политики'),
      );
  }, []);

  return (
    <div data-app className="min-h-screen bg-app text-content">
      <header className="flex items-center justify-between border-b border-line px-screen py-4">
        <Logo markSize={26} />
        <Button asChild variant="secondary" size="sm">
          <Link href="/login">Войти</Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-prose px-screen py-8">
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1.5 rounded-sm text-sm text-content-muted transition-colors duration-fast hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <ArrowLeft aria-hidden className="size-4" />
          На главную
        </Link>

        <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">
          Политика обработки персональных данных
        </h1>

        {error && (
          <p
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            {error}
          </p>
        )}

        {!policy && !error ? (
          <p className="mt-4 text-content-muted">Загрузка…</p>
        ) : policy ? (
          <>
            <p className="mt-2 text-sm text-content-muted">
              Редакция {policy.version} от {formatDateRu(policy.updatedAt)}
            </p>
            {/* Разметку отдаёт бэкенд, поэтому типографика задаётся здесь
                через потомков: заголовки, абзацы, списки. */}
            <div
              className="mt-6 leading-relaxed text-content-secondary [&_a]:text-violet-500 [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-content [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-content [&_li]:mt-1 [&_p]:mt-3 [&_strong]:text-content [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: policy.html }}
            />
          </>
        ) : null}

        <p className="mt-10 border-t border-line pt-4 text-sm text-content-muted">
          © 2026 SoftRent
        </p>
      </main>
    </div>
  );
}
