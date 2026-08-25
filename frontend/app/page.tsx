'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth';

/**
 * Точка входа: проверяем сессию и уводим дальше. Экран виден доли
 * секунды, поэтому на нём нет ничего, кроме марки и индикатора — любой
 * контент здесь всё равно не успеют прочитать.
 */
export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/dashboard' : '/login');
  }, [user, loading, router]);

  return (
    <div
      data-app
      className="flex min-h-screen flex-col items-center justify-center bg-app-gradient px-screen text-content"
    >
      <div className="flex flex-col items-center gap-3 pb-16">
        <Logo variant="lockup" className="w-44" />
        <div
          role="status"
          aria-label="Загрузка"
          className="mt-6 h-[3px] w-40 overflow-hidden rounded-pill bg-sand-200"
        >
          <div className="h-full w-1/3 animate-pulse rounded-pill bg-violet-500" />
        </div>
        <p className="text-sm text-content-muted">Загрузка…</p>
      </div>
    </div>
  );
}
