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

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register({ fullName, email, password });
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка регистрации');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout back="/login">
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-content">Регистрация</h1>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">ФИО</Label>
          <Input
            id="fullName"
            autoComplete="name"
            placeholder="Иван Иванов"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>

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
            autoComplete="new-password"
            placeholder="Минимум 8 символов"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <p className="text-center text-sm text-content-muted">
          Роль не выбирается: вы становитесь собственником, добавив объект, или
          арендатором, приняв приглашение на договор.
        </p>

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
          {busy ? 'Регистрация…' : 'Зарегистрироваться'}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-content-muted">
        Уже есть аккаунт?{' '}
        <Link
          href="/login"
          className="rounded-sm font-semibold text-content underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:text-violet-500"
        >
          Войти
        </Link>
      </p>

      <p className="mt-4 text-center text-sm">
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
