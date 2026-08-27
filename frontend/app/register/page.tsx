'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { getInvitationByToken, InvitationByToken } from '@/lib/leases';

type InvitationLookup =
  | null
  | 'loading'
  | 'not-found'
  | 'unavailable'
  | InvitationByToken;

function RegisterInner() {
  const token = useSearchParams().get('invite');
  const { register, user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [invitation, setInvitation] = useState<InvitationLookup>(
    token === null ? null : 'loading',
  );

  useEffect(() => {
    if (token === null) {
      setInvitation(null);
      setEmail('');
      return;
    }

    let active = true;
    setInvitation('loading');
    setEmail('');
    getInvitationByToken(token)
      .then((data) => {
        if (!active) return;
        setInvitation(data);
        setEmail(data.invitedEmail);
      })
      .catch((err) => {
        if (!active) return;
        setInvitation(
          err instanceof ApiError && err.status === 404
            ? 'not-found'
            : 'unavailable',
        );
      });

    return () => {
      active = false;
    };
  }, [retry, token]);

  const validInvitation =
    invitation !== null && typeof invitation === 'object';
  const userMatchesInvitation = Boolean(
    user &&
      validInvitation &&
      user.email.trim().toLowerCase() ===
        invitation.invitedEmail.trim().toLowerCase(),
  );

  useEffect(() => {
    if (!authLoading && userMatchesInvitation) {
      router.replace('/invitations');
    }
  }, [authLoading, router, userMatchesInvitation]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register({ fullName, email, password });
      router.replace(validInvitation ? '/invitations' : '/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка регистрации');
    } finally {
      setBusy(false);
    }
  }

  if (validInvitation && (authLoading || userMatchesInvitation)) {
    return (
      <AuthLayout back="/login">
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-content">
          Регистрация
        </h1>
        <p className="mt-6 text-content-muted">
          {authLoading
            ? 'Проверяем текущий аккаунт…'
            : 'Переходим к приглашениям…'}
        </p>
      </AuthLayout>
    );
  }

  if (validInvitation && user) {
    return (
      <AuthLayout back="/dashboard">
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-content">
          Другой адрес
        </h1>
        <p className="mt-6 text-content-muted">
          Вы вошли как {user.email}. Это приглашение адресовано другому адресу —
          выйдите и откройте ссылку снова.
        </p>
        <Button className="mt-6" block onClick={logout}>
          Выйти
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout back="/login">
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-content">Регистрация</h1>

      {invitation === 'loading' && (
        <p className="mt-6 text-sm text-content-muted">Проверяем приглашение…</p>
      )}
      {validInvitation && (
        <p className="mt-6 font-semibold text-content">
          Приглашение на {invitation.propertyAddress}
        </p>
      )}
      {invitation === 'not-found' && (
        <p className="mt-6 text-sm text-content-muted">
          Ссылка-приглашение недействительна или уже использована.
          Зарегистрироваться можно обычным способом.
        </p>
      )}
      {invitation === 'unavailable' && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-content-muted">
            Не удалось проверить приглашение — попробуйте позже или
            зарегистрируйтесь обычным способом.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setRetry((value) => value + 1)}
          >
            Повторить
          </Button>
        </div>
      )}

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
            readOnly={invitation === 'loading' || validInvitation}
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

        {!validInvitation && (
          <p className="text-center text-sm text-content-muted">
            Роль не выбирается: вы становитесь собственником, добавив объект, или
            арендатором, приняв приглашение на договор.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" block disabled={busy || invitation === 'loading'}>
          {busy ? 'Регистрация…' : 'Зарегистрироваться'}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-content-muted">
        Уже есть аккаунт?{' '}
        <Link
          href="/login"
          className="rounded-sm font-semibold text-content underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:text-violet-500"
        >
          {validInvitation ? 'Войдите' : 'Войти'}
        </Link>
        {validInvitation && ' — приглашение будет ждать в разделе «Приглашения».'}
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

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterInner />
    </Suspense>
  );
}
