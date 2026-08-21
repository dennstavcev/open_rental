'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { EmptyState, PageHeader, Section } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getLease, Lease } from '@/lib/leases';
import {
  createTermination,
  finalizeTermination,
  listTerminations,
  TerminationRequest,
  TERMINATION_STATUS_LABEL,
} from '@/lib/termination';

function TerminationInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [lease, setLease] = useState<Lease | null>(null);
  const [items, setItems] = useState<TerminationRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState<Record<string, string>>({});
  const [deposit, setDeposit] = useState<Record<string, string>>({});

  const isLandlord = !!lease && lease.tenantId !== user?.id;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [l, r] = await Promise.all([getLease(id), listTerminations(id)]);
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
      await createTermination(id, date, reason || undefined);
      setDate('');
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка создания');
    } finally {
      setBusy(false);
    }
  }

  async function onFinalize(reqId: string) {
    setBusy(true);
    setError(null);
    try {
      await finalizeTermination(reqId, {
        periodEndOverride: override[reqId] || undefined,
        depositReturnAmount: deposit[reqId] ? Number(deposit[reqId]) : undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка расторжения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <PageHeader back={`/leases/${id}`} title="Расторжение" subtitle="Досрочное прекращение договора" />
        {error && <div className="error">{error}</div>}

        {lease?.status === 'active' && (
          <Section title="Новая заявка">
            <form className="card" onSubmit={onCreate}>
              <div className="hint" style={{ marginTop: 0 }}>
                Дата расторжения — не ранее чем через 30 дней. Инициировать может любая сторона; расторжение подтверждает собственник.
              </div>
              <div className="field">
                <label>Желаемая дата</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="field">
                <label>Причина (необязательно)</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <button type="submit" disabled={busy} style={{ width: '100%' }}>
                {busy ? 'Отправка…' : 'Создать заявку'}
              </button>
            </form>
          </Section>
        )}

        <Section title="Заявки">
          {items.length === 0 ? (
            <EmptyState icon="key" title="Заявок на расторжение нет" />
          ) : (
            items.map((t) => (
              <div className="card" key={t.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{t.requestedTerminationDate.slice(0, 10)}</strong>
                  <span className={`pill ${t.status === 'finalized' ? 'warn' : ''}`}>
                    {TERMINATION_STATUS_LABEL[t.status]}
                  </span>
                </div>
                {t.reason && <div className="muted" style={{ marginTop: 4 }}>{t.reason}</div>}

                {t.status === 'pending' && isLandlord && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <div className="field" style={{ flex: 1, minWidth: 140, margin: 0 }}>
                        <label>Граница периода</label>
                        <input type="date" value={override[t.id] ?? ''} onChange={(e) => setOverride((s) => ({ ...s, [t.id]: e.target.value }))} />
                      </div>
                      <div className="field" style={{ flex: 1, minWidth: 140, margin: 0 }}>
                        <label>Возврат депозита, ₽</label>
                        <input type="number" value={deposit[t.id] ?? ''} onChange={(e) => setDeposit((s) => ({ ...s, [t.id]: e.target.value }))} />
                      </div>
                    </div>
                    <button disabled={busy} onClick={() => onFinalize(t.id)} style={{ width: '100%', marginTop: 12 }}>
                      Расторгнуть договор
                    </button>
                  </div>
                )}
                {t.status === 'pending' && !isLandlord && (
                  <p className="muted" style={{ marginTop: 8 }}>Ожидается решение собственника.</p>
                )}
              </div>
            ))
          )}
        </Section>
      </div>
    </>
  );
}

export default function TerminationPage() {
  return (
    <RequireAuth>
      <TerminationInner />
    </RequireAuth>
  );
}
