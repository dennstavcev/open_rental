'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout back="/">
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-content">
        Войдите в личный кабинет
      </h1>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="email">Почта</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="ivan@mail.ru"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Пароль</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" block disabled={busy}>
          {busy ? 'Вход…' : 'Войти'}
        </Button>

        <div className="flex items-center gap-3 text-sm text-content-muted">
          <span className="h-px flex-1 bg-line" />
          или
          <span className="h-px flex-1 bg-line" />
        </div>

        <Button asChild variant="secondary" block>
          <Link href="/register">Регистрация</Link>
        </Button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link
          href="/legal/privacy"
          className="rounded-sm text-content-muted underline underline-offset-4 transition-colors duration-fast hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:text-violet-500 lg:no-underline lg:hover:underline"
        >
          Политика обработки персональных данных
        </Link>
      </p>
    </AuthLayout>
  );
}
