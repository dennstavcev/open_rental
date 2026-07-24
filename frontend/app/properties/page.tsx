'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { Fab, List, PageHeader, Row, Sheet } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { createProperty, listProperties, Property } from '@/lib/properties';

function PropertiesInner() {
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

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
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка создания');
    } finally {
      setBusy(false);
    }
  }

  // Витринный первый вход — фото-фон как в референсе Claude Design.
  if (!loading && items.length === 0 && !showForm) {
    return (
      <div className="photo-backdrop">
        <div className="backdrop-scrim" />
        <div className="backdrop-content">
          <div className="auth-topbar">
            <Link href="/dashboard" aria-label="Назад">
              ←
            </Link>
          </div>
          <div
            style={{
              padding: '0 24px',
              marginTop: 'auto',
              marginBottom: 72,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-xl)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--text-on-photo)',
              }}
            >
              Сдайте первый объект
            </span>
            <span style={{ color: 'var(--text-on-photo-muted)', fontSize: 'var(--text-sm)' }}>
              Добавьте квартиру или помещение — с этого начинается работа
              арендодателя.
            </span>
            <button className="add-tile large" onClick={() => setShowForm(true)}>
              + Добавить объект
            </button>
            <Link href="/onboarding" className="auth-divider">
              или пройти мастер настройки
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <PageHeader
          title="Объекты"
          subtitle="Ваша недвижимость в аренде"
          action={
            <button className="secondary" onClick={() => setShowForm(true)}>
              + Объект
            </button>
          }
        />

        {error && <div className="error">{error}</div>}

        {loading ? (
          <List>
            <Row title={<span className="skeleton" style={{ display: 'inline-block', width: 180, height: 14 }} />} chevron={false} />
          </List>
        ) : (
          <List>
            {items.map((p) => (
              <Row
                key={p.id}
                icon="building"
                title={p.address}
                subtitle={`${p.propertyType}${p.areaSqm ? ` · ${p.areaSqm} м²` : ''}`}
                href={`/properties/${p.id}`}
              />
            ))}
          </List>
        )}
      </div>

      <Fab onClick={() => setShowForm(true)} label="Добавить объект" />

      {showForm && (
        <Sheet title="Новый объект" onClose={() => setShowForm(false)}>
          <form onSubmit={onCreate}>
            <div className="field">
              <label>Адрес</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Город, улица, дом, квартира"
                required
              />
            </div>
            <div className="field">
              <label>Тип</label>
              <input value={propertyType} onChange={(e) => setPropertyType(e.target.value)} required />
            </div>
            <div className="field">
              <label>Площадь, м² (необязательно)</label>
              <input type="number" value={area} onChange={(e) => setArea(e.target.value)} min={0} />
            </div>
            {error && <div className="error">{error}</div>}
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={() => setShowForm(false)}>
                Отмена
              </button>
              <button type="submit" disabled={busy}>
                {busy ? 'Сохранение…' : 'Добавить'}
              </button>
            </div>
          </form>
        </Sheet>
      )}
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
