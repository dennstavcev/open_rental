'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Fab, List, PageHeader, Row, Sheet } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { createProperty, listProperties, Property } from '@/lib/properties';

const PROPERTY_TYPES = ['Квартира', 'Комната', 'Дом', 'Апартаменты', 'Коммерческое'];

function PropertiesInner() {
  const router = useRouter();
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

  return (
    <>
      <TopBar />
      <div className="container">
        <PageHeader
          title="Объекты"
          subtitle="Ваша недвижимость в аренде"
          action={
            items.length > 0 ? (
              <button className="secondary" onClick={() => setShowForm(true)}>
                + Объект
              </button>
            ) : undefined
          }
        />

        {error && <div className="error">{error}</div>}

        {loading ? (
          <List>
            <Row title={<span className="skeleton" style={{ display: 'inline-block', width: 180, height: 14 }} />} chevron={false} />
          </List>
        ) : items.length === 0 ? (
          <EmptyState
            icon="building"
            title="Сдайте первый объект"
            text="Добавьте квартиру или помещение — с этого начинается работа арендодателя."
            action={
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => setShowForm(true)}>Добавить объект</button>
                <button className="secondary" onClick={() => router.push('/onboarding')}>
                  Мастер настройки
                </button>
              </div>
            }
          />
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

      {items.length > 0 && <Fab onClick={() => setShowForm(true)} label="Добавить объект" />}

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
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Тип</label>
                <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Площадь, м²</label>
                <input type="number" value={area} onChange={(e) => setArea(e.target.value)} min={0} placeholder="—" />
              </div>
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
