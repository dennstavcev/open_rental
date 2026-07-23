'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { ApiError } from '@/lib/api';
import {
  createProperty,
  listProperties,
  Property,
} from '@/lib/properties';

function PropertiesInner() {
  const router = useRouter();
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState('Квартира');
  const [area, setArea] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listProperties());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createProperty({
        address,
        propertyType,
        areaSqm: area ? Number(area) : undefined,
      });
      setAddress('');
      setArea('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка создания');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <h1>Мои объекты</h1>
        <p className="muted">
          Впервые? Пройдите <Link href="/onboarding">мастер настройки</Link>{' '}
          (объект → договор → приглашение).
        </p>

        <form className="card" onSubmit={onCreate}>
          <h3>Добавить объект</h3>
          <div className="field">
            <label>Адрес</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Тип</label>
            <input
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Площадь, кв.м (необязательно)</label>
            <input
              type="number"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              min={0}
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={busy}>
            {busy ? 'Сохранение…' : 'Добавить'}
          </button>
        </form>

        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : items.length === 0 ? (
          <div className="empty">Объектов пока нет.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Адрес</th>
                  <th>Тип</th>
                  <th className="num">Площадь</th>
                  <th>Часовой пояс</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr
                    key={p.id}
                    className="row-link"
                    onClick={() => router.push(`/properties/${p.id}`)}
                  >
                    <td>
                      <strong>{p.address}</strong>
                    </td>
                    <td>{p.propertyType}</td>
                    <td className="num">{p.areaSqm ? `${p.areaSqm} м²` : '—'}</td>
                    <td className="muted">{p.timezone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default function PropertiesPage() {
  return (
    <RequireAuth>
      <PropertiesInner />
    </RequireAuth>
  );
}
