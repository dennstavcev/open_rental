'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getLease, Lease } from '@/lib/leases';
import {
  confirmSettlement,
  createRequest,
  listRequests,
  MaintenanceRequest,
  MaintenanceStatus,
  PAYER_LABEL,
  proposeSettlement,
  SettlementPayer,
  STATUS_LABEL,
  updateStatus,
} from '@/lib/maintenance';

function RequestRow({
  req,
  isTenant,
  isLandlord,
  reload,
}: {
  req: MaintenanceRequest;
  isTenant: boolean;
  isLandlord: boolean;
  reload: () => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState<SettlementPayer>('tenant');
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const canConfirm =
    !req.settlementAppliedAt &&
    req.settlementAmount !== null &&
    ((isTenant && !req.confirmedByTenant) ||
      (isLandlord && !req.confirmedByLandlord));

  return (
    <tr>
      <td>
        <strong>{req.category}</strong>
        <div className="muted">{req.description}</div>
      </td>
      <td>
        {isLandlord ? (
          <select
            value={req.status}
            disabled={busy}
            onChange={(e) => run(() => updateStatus(req.id, e.target.value as MaintenanceStatus))}
          >
            <option value="open">Открыта</option>
            <option value="in_progress">В работе</option>
            <option value="resolved">Решена</option>
          </select>
        ) : (
          <span className="pill">{STATUS_LABEL[req.status]}</span>
        )}
      </td>
      <td>
        {req.settlementAmount ? (
          <div className="muted">
            {req.settlementAmount} ₽ · {req.settlementPayer && PAYER_LABEL[req.settlementPayer]}
            <br />
            {req.settlementAppliedAt
              ? 'согласовано → в счёт'
              : `аренд. ${req.confirmedByTenant ? '✓' : '—'} / собств. ${req.confirmedByLandlord ? '✓' : '—'}`}
          </div>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        {!req.settlementAppliedAt && (
          <div className="table-actions">
            <input
              type="number"
              placeholder="Сумма ₽"
              style={{ width: 90 }}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <select value={payer} onChange={(e) => setPayer(e.target.value as SettlementPayer)}>
              <option value="tenant">Арендатор</option>
              <option value="owner">Собственник</option>
              <option value="split">Пополам</option>
            </select>
            <button
              className="secondary"
              disabled={busy || !amount}
              onClick={() => run(() => proposeSettlement(req.id, Number(amount), payer))}
            >
              Предложить
            </button>
            {canConfirm && (
              <button disabled={busy} onClick={() => run(() => confirmSettlement(req.id))}>
                Подтвердить
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function RequestsInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [lease, setLease] = useState<Lease | null>(null);
  const [items, setItems] = useState<MaintenanceRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const isTenant = !!lease && lease.tenantId === user?.id;
  const isLandlord = !!lease && lease.tenantId !== user?.id;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [l, r] = await Promise.all([getLease(id), listRequests(id)]);
      setLease(l);
      setItems(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createRequest(id, category, description, fileRef.current?.files?.[0]);
      setCategory('');
      setDescription('');
      if (fileRef.current) fileRef.current.value = '';
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
        <h1>Заявки на обслуживание</h1>
        {error && <div className="error">{error}</div>}

        {isTenant && (
          <form className="card" onSubmit={onCreate}>
            <h3>Новая заявка</h3>
            <div className="field">
              <label>Категория</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} required />
            </div>
            <div className="field">
              <label>Описание</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" />
            <div style={{ marginTop: 8 }}>
              <button type="submit" disabled={busy}>
                {busy ? 'Отправка…' : 'Создать заявку'}
              </button>
            </div>
          </form>
        )}

        {items.length === 0 ? (
          <div className="empty">Заявок пока нет.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Заявка</th>
                  <th>Статус</th>
                  <th>Урегулирование</th>
                  <th>Согласование суммы</th>
                </tr>
              </thead>
              <tbody>
                {items.map((req) => (
                  <RequestRow
                    key={req.id}
                    req={req}
                    isTenant={isTenant}
                    isLandlord={isLandlord}
                    reload={load}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default function RequestsPage() {
  return (
    <RequireAuth>
      <RequestsInner />
    </RequireAuth>
  );
}
