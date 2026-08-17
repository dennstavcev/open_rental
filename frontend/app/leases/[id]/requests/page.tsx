'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Fab, Icon, LeaseTabs, PageHeader, Sheet } from '@/components/ui';
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
import { formatMoney } from '@/lib/format';
import { usePolling } from '@/lib/usePolling';

function RequestCard({
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
    ((isTenant && !req.confirmedByTenant) || (isLandlord && !req.confirmedByLandlord));

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span className="lead warm"><Icon name="wrench" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong>{req.category}</strong>
            {isLandlord ? (
              <select
                value={req.status}
                disabled={busy}
                onChange={(e) => run(() => updateStatus(req.id, e.target.value as MaintenanceStatus))}
                style={{ width: 'auto', padding: '4px 10px', fontSize: 'var(--text-sm)' }}
              >
                <option value="open">Открыта</option>
                <option value="in_progress">В работе</option>
                <option value="resolved">Решена</option>
              </select>
            ) : (
              <span className="pill">{STATUS_LABEL[req.status]}</span>
            )}
          </div>
          <div className="muted" style={{ marginTop: 4 }}>{req.description}</div>
        </div>
      </div>

      {req.settlementAmount && (
        <div className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
          Урегулирование: <strong>{formatMoney(req.settlementAmount)} ₽</strong> ·{' '}
          {req.settlementPayer && PAYER_LABEL[req.settlementPayer]}
          {' — '}
          {req.settlementAppliedAt
            ? 'согласовано, добавлено в счёт'
            : `подтвердили: арендатор ${req.confirmedByTenant ? '✓' : '—'}, собственник ${req.confirmedByLandlord ? '✓' : '—'}`}
        </div>
      )}

      {!req.settlementAppliedAt && (
        <div className="table-actions" style={{ marginTop: 12 }}>
          <input
            type="number"
            placeholder="Сумма ₽"
            style={{ width: 110 }}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <select value={payer} onChange={(e) => setPayer(e.target.value as SettlementPayer)} style={{ width: 'auto' }}>
            <option value="tenant">Арендатор</option>
            <option value="owner">Собственник</option>
            <option value="split">Пополам</option>
          </select>
          <button className="secondary" disabled={busy || !amount} onClick={() => run(() => proposeSettlement(req.id, Number(amount), payer))}>
            Предложить
          </button>
          {canConfirm && (
            <button disabled={busy} onClick={() => run(() => confirmSettlement(req.id))}>Подтвердить</button>
          )}
        </div>
      )}
    </div>
  );
}

function RequestsInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [lease, setLease] = useState<Lease | null>(null);
  const [items, setItems] = useState<MaintenanceRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
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
  usePolling(load, 30000);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createRequest(id, category, description, fileRef.current?.files?.[0]);
      setCategory('');
      setDescription('');
      if (fileRef.current) fileRef.current.value = '';
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
        <PageHeader back={`/leases/${id}`} title="Заявки" subtitle="Обслуживание и урегулирование" />
        <LeaseTabs id={id} />
        {error && <div className="error">{error}</div>}

        {items.length === 0 ? (
          <EmptyState
            icon="wrench"
            title="Заявок пока нет"
            text={isTenant ? 'Создайте заявку, если что-то требует ремонта или внимания.' : 'Заявки создаёт арендатор.'}
            action={isTenant ? <button onClick={() => setShowForm(true)}>Новая заявка</button> : undefined}
          />
        ) : (
          items.map((req) => (
            <RequestCard key={req.id} req={req} isTenant={isTenant} isLandlord={isLandlord} reload={load} />
          ))
        )}
      </div>

      {isTenant && items.length > 0 && <Fab onClick={() => setShowForm(true)} label="Новая заявка" />}

      {showForm && (
        <Sheet title="Новая заявка" onClose={() => setShowForm(false)}>
          <form onSubmit={onCreate}>
            <div className="field">
              <label>Категория</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Сантехника, электрика…" required />
            </div>
            <div className="field">
              <label>Описание</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} required />
            </div>
            <div className="field">
              <label>Фото (необязательно)</label>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" />
            </div>
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={() => setShowForm(false)}>Отмена</button>
              <button type="submit" disabled={busy}>{busy ? 'Отправка…' : 'Создать'}</button>
            </div>
          </form>
        </Sheet>
      )}
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
