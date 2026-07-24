'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
    <div className="photo-backdrop">
      <div className="backdrop-scrim" />
      <div className="backdrop-content">
        <div className="auth-topbar">
          <Link href="/login" aria-label="Назад">←</Link>
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
          <h1>Регистрация</h1>
          <input
            placeholder="ФИО"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Почта"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Пароль (мин. 8 символов)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <p className="muted" style={{ margin: '-8px 0 0', textAlign: 'center' }}>
            Роль не выбирается: вы становитесь собственником, добавив объект,
            или арендатором, приняв приглашение на договор.
          </p>
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={busy}>
            {busy ? 'Регистрация…' : 'Зарегистрироваться'}
          </button>
          <p className="auth-divider">
            Уже есть аккаунт? <Link href="/login">Войти</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
