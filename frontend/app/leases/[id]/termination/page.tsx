'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
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
        <h1>Расторжение договора</h1>
        {error && <div className="error">{error}</div>}

        {lease?.status === 'active' && (
          <form className="card" onSubmit={onCreate}>
            <h3>Заявка на расторжение</h3>
            <p className="muted">Дата расторжения — не ранее чем через 30 дней.</p>
            <div className="field">
              <label>Желаемая дата</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="field">
              <label>Причина (необязательно)</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <button type="submit" disabled={busy}>
              {busy ? 'Отправка…' : 'Создать заявку'}
            </button>
          </form>
        )}

        {items.length === 0 ? (
          <p className="muted">Заявок на расторжение нет.</p>
        ) : (
          items.map((t) => (
            <div className="card" key={t.id}>
              <div>
                <strong>{TERMINATION_STATUS_LABEL[t.status]}</strong> · дата{' '}
                {t.requestedTerminationDate.slice(0, 10)}
              </div>
              {t.reason && <div className="muted">{t.reason}</div>}

              {t.status === 'pending' && isLandlord && (
                <div style={{ marginTop: 8 }}>
                  <p className="muted">
                    Финализировать расторжение (решение собственника):
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="date"
                      value={override[t.id] ?? ''}
                      onChange={(e) =>
                        setOverride((s) => ({ ...s, [t.id]: e.target.value }))
                      }
                      title="Граница последнего периода (необязательно)"
                    />
                    <input
                      type="number"
                      placeholder="Возврат задатка ₽"
                      value={deposit[t.id] ?? ''}
                      onChange={(e) =>
                        setDeposit((s) => ({ ...s, [t.id]: e.target.value }))
                      }
                    />
                    <button disabled={busy} onClick={() => onFinalize(t.id)}>
                      Расторгнуть
                    </button>
                  </div>
                </div>
              )}
              {t.status === 'pending' && !isLandlord && (
                <p className="muted">Ожидается решение собственника.</p>
              )}
            </div>
          ))
        )}
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
