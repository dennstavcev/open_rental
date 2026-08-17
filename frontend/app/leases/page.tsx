'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import {
  EmptyState,
  Fab,
  List,
  PageHeader,
  Row,
  Section,
  Segmented,
  Sheet,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { listProperties, Property } from '@/lib/properties';
import { addElevenMonths, createLease, Lease, listLeases, STATUS_LABEL } from '@/lib/leases';

type Filter = 'all' | 'owner' | 'tenant';

function LeasesInner() {
  const { user } = useAuth();
  const router = useRouter();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [propertyId, setPropertyId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('0');
  const [paymentDay, setPaymentDay] = useState('20');
  const [penalty, setPenalty] = useState('0.1');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [l, p] = await Promise.all([listLeases(), listProperties()]);
      setLeases(l);
      setProperties(p);
      if (p.length && !propertyId) setPropertyId(p[0].id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addr = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p.address])),
    [properties],
  );

  const shown = leases.filter((l) => {
    if (filter === 'owner') return l.tenantId !== user?.id;
    if (filter === 'tenant') return l.tenantId === user?.id;
    return true;
  });

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const l = await createLease(propertyId, {
        startDate,
        endDate,
        rentAmount: Number(rentAmount),
        depositAmount: Number(depositAmount),
        paymentDay: Number(paymentDay),
        penaltyRatePercentPerDay: Number(penalty),
      });
      setShowForm(false);
      router.push(`/leases/${l.id}`);
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
          title="Договоры"
          subtitle="Аренда, где вы собственник или арендатор"
          action={
            properties.length > 0 ? (
              <button className="secondary" onClick={() => setShowForm(true)}>
                + Договор
              </button>
            ) : undefined
          }
        />

        {error && <div className="error">{error}</div>}

        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Все' },
            { value: 'owner', label: 'Я собственник' },
            { value: 'tenant', label: 'Я арендатор' },
          ]}
        />

        {loading ? (
          <List>
            <Row title={<span className="skeleton" style={{ display: 'inline-block', width: 170, height: 14 }} />} chevron={false} />
          </List>
        ) : properties.length === 0 && leases.length === 0 ? (
          <EmptyState
            icon="doc"
            title="Договоров пока нет"
            text="Сначала добавьте объект — затем оформите договор аренды."
            action={<button onClick={() => router.push('/properties')}>Добавить объект</button>}
          />
        ) : shown.length === 0 ? (
          <EmptyState icon="doc" title="Ничего не найдено" text="В этой категории договоров нет." />
        ) : (
          <List>
            {shown.map((l) => (
              <Row
                key={l.id}
                icon="doc"
                title={addr[l.propertyId] ?? `Договор ${l.id.slice(0, 8)}`}
                subtitle={`${l.tenantId === user?.id ? 'Аренда' : 'Сдаю'} · ${l.rentAmount} ₽/мес`}
                trail={
                  <span className={`pill ${l.status === 'active' ? 'ok' : ''}`}>
                    {STATUS_LABEL[l.status]}
                  </span>
                }
                href={`/leases/${l.id}`}
              />
            ))}
          </List>
        )}
      </div>

      {properties.length > 0 && (
        <Fab onClick={() => setShowForm(true)} label="Новый договор" />
      )}

      {showForm && (
        <Sheet title="Новый договор" onClose={() => setShowForm(false)}>
          <form onSubmit={onCreate}>
            <div className="field">
              <label>Объект</label>
              <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.address}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Начало</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setEndDate(addElevenMonths(e.target.value));
                  }}
                  required
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Окончание</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label>Аренда, ₽/мес</label>
              <input type="number" value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} required />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Задаток, ₽</label>
                <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>День оплаты</label>
                <input type="number" value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} min={1} max={28} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Пеня, %/день</label>
                <input type="number" step="0.01" value={penalty} onChange={(e) => setPenalty(e.target.value)} min={0} />
              </div>
            </div>
            {error && <div className="error">{error}</div>}
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={() => setShowForm(false)}>
                Отмена
              </button>
              <button type="submit" disabled={busy}>
                {busy ? 'Создание…' : 'Создать черновик'}
              </button>
            </div>
          </form>
        </Sheet>
      )}
    </>
  );
}

export default function LeasesPage() {
  return (
    <RequireAuth>
      <LeasesInner />
    </RequireAuth>
  );
}
