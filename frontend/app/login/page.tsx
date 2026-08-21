'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
    <div className="photo-backdrop">
      <div className="backdrop-scrim" />
      <div className="backdrop-content">
        <div className="auth-topbar">
          <Link href="/" aria-label="Назад">←</Link>
        </div>
        <div className="auth-brand">
          SOFTRENT
          <div
            style={{
              fontWeight: 'var(--weight-regular)',
              fontSize: 'var(--text-sm)',
              letterSpacing: 0,
              color: 'var(--text-on-photo-muted)',
              marginTop: 6,
            }}
          >
            Всё нужное — в одном окне.
          </div>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          <h1>Войдите в личный кабинет</h1>
          <input
            type="email"
            placeholder="Почта"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={busy}>
            {busy ? 'Вход…' : 'Войти'}
          </button>
          <div className="auth-divider">или</div>
          <Link href="/register">
            <button type="button" className="secondary" style={{ width: '100%' }}>
              Регистрация
            </button>
          </Link>
          <p className="auth-policy">
            <Link href="/legal/privacy">
              Политика обработки персональных данных
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
