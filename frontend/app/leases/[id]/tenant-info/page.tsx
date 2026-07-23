'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { ApiError } from '@/lib/api';
import { getTenantInfo, putTenantInfo, TenantInfo } from '@/lib/tenantInfo';

const EMPTY: TenantInfo = {
  passportSeries: '',
  passportNumber: '',
  passportIssuedBy: '',
  birthDate: '',
  registrationAddress: '',
  phone: '',
};

function TenantInfoInner() {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<TenantInfo>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getTenantInfo(id);
      if (data) setForm({ ...EMPTY, ...data, birthDate: data.birthDate.slice(0, 10) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof TenantInfo>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await putTenantInfo(id, form);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <h1>Паспортные данные</h1>
        <p className="muted">
          Данные хранятся в зашифрованном виде; доступны только вам и
          администратору сервиса (арендодатель их не видит).
        </p>
        <form className="card" onSubmit={onSubmit}>
          <div className="field">
            <label>Серия паспорта</label>
            <input value={form.passportSeries} onChange={(e) => set('passportSeries', e.target.value)} required />
          </div>
          <div className="field">
            <label>Номер паспорта</label>
            <input value={form.passportNumber} onChange={(e) => set('passportNumber', e.target.value)} required />
          </div>
          <div className="field">
            <label>Кем выдан</label>
            <input value={form.passportIssuedBy} onChange={(e) => set('passportIssuedBy', e.target.value)} required />
          </div>
          <div className="field">
            <label>Дата рождения</label>
            <input type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} required />
          </div>
          <div className="field">
            <label>Адрес регистрации</label>
            <input value={form.registrationAddress} onChange={(e) => set('registrationAddress', e.target.value)} required />
          </div>
          <div className="field">
            <label>Телефон (необязательно)</label>
            <input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          </div>
          {error && <div className="error">{error}</div>}
          {saved && <div className="muted">Сохранено.</div>}
          <button type="submit" disabled={busy}>
            {busy ? 'Сохранение…' : 'Сохранить'}
          </button>
        </form>
      </div>
    </>
  );
}

export default function TenantInfoPage() {
  return (
    <RequireAuth>
      <TenantInfoInner />
    </RequireAuth>
  );
}
