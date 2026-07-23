'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { listProperties, Property } from '@/lib/properties';
import {
  createLease,
  Lease,
  listLeases,
  STATUS_LABEL,
} from '@/lib/leases';

function LeasesInner() {
  const { user } = useAuth();
  const router = useRouter();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    // propertyId намеренно не в зависимостях — только инициализация
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createLease(propertyId, {
        startDate,
        endDate,
        rentAmount: Number(rentAmount),
        depositAmount: Number(depositAmount),
        paymentDay: Number(paymentDay),
        penaltyRatePercentPerDay: Number(penalty),
      });
      setStartDate('');
      setEndDate('');
      setRentAmount('');
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
        <h1>Договоры</h1>

        {properties.length === 0 ? (
          <p className="muted">
            Сначала добавьте <Link href="/properties">объект</Link>.
          </p>
        ) : (
          <form className="card" onSubmit={onCreate}>
            <h3>Новый договор (черновик)</h3>
            <div className="field">
              <label>Объект</label>
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.address}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Дата начала</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Дата окончания</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Аренда, ₽/мес</label>
              <input
                type="number"
                value={rentAmount}
                onChange={(e) => setRentAmount(e.target.value)}
                min={0}
                required
              />
            </div>
            <div className="field">
              <label>Задаток, ₽</label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                min={0}
              />
            </div>
            <div className="field">
              <label>День оплаты (1–28)</label>
              <input
                type="number"
                value={paymentDay}
                onChange={(e) => setPaymentDay(e.target.value)}
                min={1}
                max={28}
              />
            </div>
            <div className="field">
              <label>Пеня, %/день</label>
              <input
                type="number"
                step="0.01"
                value={penalty}
                onChange={(e) => setPenalty(e.target.value)}
                min={0}
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={busy}>
              {busy ? 'Сохранение…' : 'Создать черновик'}
            </button>
          </form>
        )}

        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : leases.length === 0 ? (
          <div className="empty">Договоров пока нет.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Договор</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th className="num">Аренда, ₽/мес</th>
                  <th>Срок</th>
                </tr>
              </thead>
              <tbody>
                {leases.map((l) => (
                  <tr
                    key={l.id}
                    className="row-link"
                    onClick={() => router.push(`/leases/${l.id}`)}
                  >
                    <td>
                      <strong>{l.id.slice(0, 8)}</strong>
                    </td>
                    <td>{l.tenantId === user?.id ? 'Арендатор' : 'Собственник'}</td>
                    <td>
                      <span className={`pill ${l.status === 'active' ? 'ok' : ''}`}>
                        {STATUS_LABEL[l.status]}
                      </span>
                    </td>
                    <td className="num">{l.rentAmount}</td>
                    <td className="muted">
                      {l.startDate.slice(0, 10)} — {l.endDate.slice(0, 10)}
                    </td>
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

export default function LeasesPage() {
  return (
    <RequireAuth>
      <LeasesInner />
    </RequireAuth>
  );
}
