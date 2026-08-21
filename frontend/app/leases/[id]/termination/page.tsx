'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Clock, KeyRound } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { Section } from '@/components/Section';
import { StatusPill } from '@/components/StatusPill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <AppShell>
      <PageHeader
        back={`/leases/${id}`}
        backLabel="Договор"
        title="Расторжение"
        subtitle="Досрочное прекращение договора"
      />

      {error && (
        <p
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
        >
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}

      {/* Форма и список — в узкой колонке: это не табличный экран, а
          последовательность решений по одному договору. */}
      <div className="max-w-2xl">
        {lease?.status === 'active' && (
          <Section title="Новая заявка" className="mt-0">
            <form onSubmit={onCreate} className="space-y-4">
              <p className="max-w-prose text-sm text-content-muted">
                Дата расторжения — не ранее чем через 30 дней. Инициировать может любая
                сторона; расторжение подтверждает собственник.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="term-date">Желаемая дата</Label>
                <Input
                  id="term-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="term-reason">Причина (необязательно)</Label>
                <Input
                  id="term-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Например: переезд в другой город"
                />
              </div>
              <Button type="submit" block disabled={busy}>
                {busy ? 'Отправка…' : 'Создать заявку'}
              </Button>
            </form>
          </Section>
        )}

        <Section title="Заявки">
          {items.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="Заявок на расторжение нет"
              text="Договор действует до конца срока. Заявку может создать любая сторона."
            />
          ) : (
            <div className="divide-y divide-line border-y border-line">
              {items.map((t) => (
                <article key={t.id} className="py-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-content [font-variant-numeric:tabular-nums]">
                      {t.requestedTerminationDate.slice(0, 10)}
                    </h3>
                    <StatusPill tone={t.status === 'finalized' ? 'neutral' : 'warn'}>
                      {TERMINATION_STATUS_LABEL[t.status]}
                    </StatusPill>
                  </div>
                  {t.reason && (
                    <p className="mt-1 max-w-prose text-content-secondary">{t.reason}</p>
                  )}

                  {t.status === 'pending' && isLandlord && (
                    <div className="mt-4 rounded-md bg-sand-200/60 p-4">
                      <p className="mb-3 text-sm font-semibold text-content">Решение</p>
                      <div className="flex flex-wrap gap-4">
                        <div className="min-w-40 flex-1 space-y-1.5">
                          <Label htmlFor={`end-${t.id}`}>Граница периода</Label>
                          <Input
                            id={`end-${t.id}`}
                            type="date"
                            value={override[t.id] ?? ''}
                            onChange={(e) =>
                              setOverride((s) => ({ ...s, [t.id]: e.target.value }))
                            }
                          />
                        </div>
                        <div className="min-w-40 flex-1 space-y-1.5">
                          <Label htmlFor={`dep-${t.id}`}>Возврат депозита, ₽</Label>
                          <Input
                            id={`dep-${t.id}`}
                            type="number"
                            value={deposit[t.id] ?? ''}
                            onChange={(e) =>
                              setDeposit((s) => ({ ...s, [t.id]: e.target.value }))
                            }
                          />
                        </div>
                      </div>
                      <p className="mt-3 max-w-prose text-sm text-content-muted">
                        После расторжения данные сторон замораживаются и удаляются по
                        истечении срока хранения.
                      </p>
                      <Button
                        className="mt-4"
                        disabled={busy}
                        onClick={() => onFinalize(t.id)}
                      >
                        Расторгнуть договор
                      </Button>
                    </div>
                  )}

                  {t.status === 'pending' && !isLandlord && (
                    <p className="mt-3 flex items-center gap-2 text-sm text-content-muted">
                      <Clock aria-hidden className="size-4 shrink-0" />
                      Ожидается решение собственника.
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </Section>
      </div>
    </AppShell>
  );
}

export default function TerminationPage() {
  return (
    <RequireAuth>
      <TerminationInner />
    </RequireAuth>
  );
}
