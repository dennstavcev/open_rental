'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Fab, List, PageHeader, Row, Section, Sheet } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { createProperty, listProperties, Property } from '@/lib/properties';
import { Lease, listLeases, STATUS_LABEL } from '@/lib/leases';

const PROPERTY_TYPES = ['Квартира', 'Комната', 'Дом', 'Апартаменты', 'Коммерческое'];

// Приоритет статуса для строки объекта, если по нему есть несколько
// договоров (история) — показываем самый «живой».
const STATUS_PRIORITY = { active: 0, sent: 1, draft: 2, terminated: 3 };

function PropertiesInner() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<Property[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
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
      const [props, allLeases] = await Promise.all([listProperties(), listLeases()]);
      setItems(props);
      setLeases(allLeases);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  const leaseByProperty = useMemo(() => {
    const map: Record<string, Lease> = {};
    for (const l of leases) {
      const current = map[l.propertyId];
      if (!current || STATUS_PRIORITY[l.status] < STATUS_PRIORITY[current.status]) {
        map[l.propertyId] = l;
      }
    }
    return map;
  }, [leases]);

  const tenantLeases = useMemo(
    () => leases.filter((l) => l.tenantId === user?.id),
    [leases, user],
  );

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
          title="Аренда"
          subtitle="Объекты в собственности и договоры, где вы арендатор"
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
        ) : items.length === 0 && tenantLeases.length === 0 ? (
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
          <>
            {items.length > 0 && (
              <List>
                {items.map((p) => {
                  const lease = leaseByProperty[p.id];
                  return (
                    <Row
                      key={p.id}
                      icon="building"
                      title={p.address}
                      subtitle={`${p.propertyType}${p.areaSqm ? ` · ${p.areaSqm} м²` : ''}`}
                      trail={
                        <span className={`pill ${lease?.status === 'active' ? 'ok' : ''}`}>
                          {lease ? STATUS_LABEL[lease.status] : 'Без договора'}
                        </span>
                      }
                      href={`/properties/${p.id}`}
                    />
                  );
                })}
              </List>
            )}

            {tenantLeases.length > 0 && (
              <Section title="Договоры, где вы арендатор">
                <List>
                  {tenantLeases.map((l) => (
                    <Row
                      key={l.id}
                      icon="doc"
                      title={`Договор · ${l.rentAmount} ₽/мес`}
                      subtitle={`${l.startDate.slice(0, 10)} — ${l.endDate.slice(0, 10)}`}
                      trail={
                        <span className={`pill ${l.status === 'active' ? 'ok' : ''}`}>
                          {STATUS_LABEL[l.status]}
                        </span>
                      }
                      href={`/leases/${l.id}`}
                    />
                  ))}
                </List>
              </Section>
            )}
          </>
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
                <input type="number" step="0.01" value={area} onChange={(e) => setArea(e.target.value)} min={0} placeholder="—" />
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
