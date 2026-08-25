'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

// Клиентский гард: пускает только аутентифицированных, иначе → /login.
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div data-app className="min-h-screen bg-app-shell px-screen py-8">
        <p className="text-content-muted">Загрузка…</p>
      </div>
    );
  }
  return <>{children}</>;
}
