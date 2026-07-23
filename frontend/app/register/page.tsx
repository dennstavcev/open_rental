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
    <div className="auth-wrap">
      <div className="brand">OPENRENT</div>
      <div className="card">
      <h1 style={{ textAlign: 'center' }}>Регистрация</h1>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>ФИО</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Пароль (мин. 8 символов)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>
          Роль не выбирается: вы становитесь собственником, добавив объект,
          или арендатором, приняв приглашение на договор.
        </p>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? 'Регистрация…' : 'Зарегистрироваться'}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 12 }}>
        Уже есть аккаунт? <Link href="/login">Войти</Link>
      </p>
      </div>
    </div>
  );
}
