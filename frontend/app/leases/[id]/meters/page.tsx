'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Ban, CalendarDays, Copy, Droplet, Flame, Gauge, Zap } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { LeaseTabs } from '@/components/LeaseTabs';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { StatusPill } from '@/components/StatusPill';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { listMetersForLease, submitReading, Meter, METER_UNIT_LABEL } from '@/lib/catalog';
import { copyText } from '@/lib/clipboard';
import { formatMoney, formatReadingForCopy } from '@/lib/format';
import { getLease, Lease } from '@/lib/leases';
import { usePolling } from '@/lib/usePolling';

const METER_ICON: Record<Meter['meterType'], LucideIcon> = {
  electricity: Zap,
  water: Droplet,
  gas: Flame,
  heating: Flame,
};

type PendingReading = {
  consumption: number;
  cost: number;
  previousValue: number;
  warning: string | null;
  photo: File;
};

function MetersHubInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [lease, setLease] = useState<Lease | null>(null);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [readingsDueDate, setReadingsDueDate] = useState('');
  const [readingsDaysLeft, setReadingsDaysLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [readMeter, setReadMeter] = useState<Meter | null>(null);
  const [readValue, setReadValue] = useState('');
  const [pending, setPending] = useState<PendingReading | null>(null);
  const [pendingChanged, setPendingChanged] = useState(false);
  const readFileRef = useRef<HTMLInputElement>(null);

  const archived = lease?.status === 'terminated';
  const isLandlord = !!lease && lease.tenantId !== user?.id;

  const load = useCallback(async (foreground = false) => {
    if (foreground) {
      setLoading(true);
      setError(null);
    }
    try {
      const [nextLease, view] = await Promise.all([
        getLease(id),
        listMetersForLease(id),
      ]);
      setLease(nextLease);
      setMeters(view.meters);
      setPeriodStart(view.periodStart.slice(0, 10));
      setPeriodEnd(view.periodEnd.slice(0, 10));
      setReadingsDueDate(view.readingsDueDate.slice(0, 10));
      setReadingsDaysLeft(view.readingsDaysLeft);
      setLoaded(true);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    } finally {
      if (foreground) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load(true);
  }, [load]);
  const refresh = useCallback(() => {
    void load(false);
  }, [load]);
  usePolling(refresh, 30000);

  function closeReading() {
    setReadMeter(null);
    setReadValue('');
    setPending(null);
    setPendingChanged(false);
    if (readFileRef.current) readFileRef.current.value = '';
  }

  useEffect(() => {
    if (archived && readMeter) closeReading();
    // Диалог закрывается именно при смене статуса после polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archived]);

  function openReading(m: Meter) {
    setReadMeter(m);
    setReadValue(String(m.lastReadingValue));
    setPending(null);
    setPendingChanged(false);
  }

  async function onSubmitReading(e: FormEvent) {
    e.preventDefault();
    const photo = readFileRef.current?.files?.[0];
    if (!photo || !readValue || !readMeter) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitReading(readMeter.id, Number(readValue), photo);
      if (result.requiresConfirmation) {
        setPending({ ...result, photo });
        setPendingChanged(false);
        return;
      }
      closeReading();
      await load(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка отправки');
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmReading() {
    if (!pending || !readMeter) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitReading(
        readMeter.id,
        Number(readValue),
        pending.photo,
        true,
        pending.previousValue,
      );
      if (result.requiresConfirmation) {
        setPending({ ...result, photo: pending.photo });
        setPendingChanged(true);
        return;
      }
      closeReading();
      await load(false);
    } catch (err) {
      setPending(null);
      setPendingChanged(false);
      setError(err instanceof ApiError ? err.message : 'Ошибка отправки');
    } finally {
      setBusy(false);
    }
  }

  async function copyReading(m: Meter) {
    if (!(await copyText(formatReadingForCopy(m.lastReadingValue)))) {
      setError('Не удалось скопировать — выделите значение вручную');
      return;
    }
    setError(null);
    setCopied(m.id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <AppShell>
      <PageHeader
        back={`/leases/${id}`}
        backLabel="Договор"
        title="Показания"
        subtitle="Счётчики по этому договору"
      />
      <LeaseTabs id={id} archived={archived} />

      {error && !loaded && (
        <div
          role="alert"
          className="mb-6 rounded-md border border-danger-line bg-danger-weak px-4 py-4 text-danger"
        >
          <p className="flex items-center gap-2 text-sm">
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            {error}
          </p>
          <Button className="mt-3" variant="secondary" onClick={() => void load(true)}>
            Повторить
          </Button>
        </div>
      )}

      {error && loaded && (
        <p
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
        >
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}

      {/* Срок текущего периода — общий для всех счётчиков, поэтому вынесен
          из карточек наверх: это главное, что нужно знать арендатору. */}
      {loaded && !archived && meters.length > 0 && (
        <p
          className={`mb-6 flex items-center gap-3 rounded-md px-4 py-3 text-sm ${
            readingsDaysLeft < 0
              ? 'border border-danger-line bg-danger-weak text-danger'
              : 'bg-sand-200/60 text-content-secondary'
          }`}
        >
          <CalendarDays aria-hidden className="size-4 shrink-0" />
          <span>
            Текущий период: {periodStart} — {periodEnd} · показания до{' '}
            {readingsDueDate}
            {readingsDaysLeft < 0 && (
              <> · Показания просрочены на {-readingsDaysLeft} дн.</>
            )}
          </span>
        </p>
      )}

      {error && !loaded ? null : loading && !loaded ? (
        <p className="text-content-muted">Загрузка…</p>
      ) : loaded && meters.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="Счётчиков пока нет"
          text={
            isLandlord
              ? 'Добавьте счётчики на карточке объекта — тогда показания будут попадать в счёт автоматически.'
              : 'Собственник ещё не добавил счётчики по этому объекту.'
          }
        />
      ) : loaded ? (
        <div className="divide-y divide-line border-y border-line">
          {meters.map((m) => {
            const Icon = METER_ICON[m.meterType];
            const readingsStatus =
              m.readingsStatus ??
              (!m.isActive
                ? 'not_required'
                : m.currentPeriodSubmitted
                  ? 'submitted'
                  : 'due');
            return (
              <article
                key={m.id}
                className="flex flex-wrap items-center gap-4 py-4 sm:flex-nowrap"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-icon text-content-secondary">
                  <Icon aria-hidden className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-content">{m.name}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-content-muted">
                      {m.serialNumber ? `№ ${m.serialNumber} · ` : ''}
                      Текущее: {m.lastReadingValue} {METER_UNIT_LABEL[m.meterType]}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void copyReading(m)}
                      aria-label={`Копировать показание счётчика «${m.name}»`}
                    >
                      <Copy aria-hidden />
                      {copied === m.id ? 'Скопировано' : 'Копировать'}
                    </Button>
                  </div>
                  {m.calibrationDueDate && (
                    <p className="mt-1 text-sm text-content-muted">
                      Поверка счётчика: {m.calibrationDueDate.slice(0, 10)}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {readingsStatus === 'not_required' ? (
                    m.isActive ? (
                      <StatusPill tone="neutral">Договор не действует</StatusPill>
                    ) : (
                      <StatusPill tone="neutral" icon={Ban}>
                        Отключён
                      </StatusPill>
                    )
                  ) : readingsStatus === 'submitted' ? (
                    <StatusPill tone="success">Показания внесены</StatusPill>
                  ) : readingsStatus === 'overdue' ? (
                    <StatusPill tone="danger">
                      Просрочено на {-readingsDaysLeft} дн.
                    </StatusPill>
                  ) : (
                    <StatusPill tone="warn">
                      Внесите до {readingsDueDate}
                    </StatusPill>
                  )}

                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/leases/${id}/meters/${m.id}/history`}>История</Link>
                  </Button>
                  {!archived && m.isActive && !m.currentPeriodSubmitted && (
                    <Button size="sm" onClick={() => openReading(m)}>
                      Внести
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <Dialog open={readMeter !== null && !archived} onOpenChange={(open) => !open && closeReading()}>
        {readMeter && (
          <DialogContent title={`Показание · ${readMeter.name}`}>
            {pending ? (
              <div className="space-y-4">
                <p
                  className={`flex items-center gap-2 rounded-md px-4 py-3 text-sm ${
                    pending.warning
                      ? 'border border-warn-line bg-warn-weak text-warn'
                      : 'border border-line bg-surface-icon text-content-secondary'
                  }`}
                >
                  <AlertTriangle aria-hidden className="size-4 shrink-0" />
                  {pending.warning === null
                    ? 'Показания изменились — проверьте расход'
                    : pendingChanged
                      ? 'Показания изменились, проверьте ещё раз'
                      : pending.warning}
                </p>
                <dl className="rounded-md border border-line px-4 py-3 text-sm">
                  <div className="flex justify-between gap-4 py-1">
                    <dt className="text-content-muted">Показание</dt>
                    <dd className="font-semibold text-content">
                      {readValue} {METER_UNIT_LABEL[readMeter.meterType]}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-1">
                    <dt className="text-content-muted">Расход</dt>
                    <dd className="font-semibold text-content">
                      {pending.consumption} {METER_UNIT_LABEL[readMeter.meterType]}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-1">
                    <dt className="text-content-muted">Сумма</dt>
                    <dd className="font-bold text-terracotta-500">
                      {formatMoney(pending.cost)} ₽
                    </dd>
                  </div>
                </dl>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setPending(null);
                      setPendingChanged(false);
                    }}
                  >
                    Исправить
                  </Button>
                  <Button type="button" disabled={busy} onClick={() => void onConfirmReading()}>
                    {busy ? 'Сохранение…' : 'Всё верно, сохранить'}
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <form onSubmit={onSubmitReading} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reading">
                    Новое показание, {METER_UNIT_LABEL[readMeter.meterType]}
                  </Label>
                  <Input
                    id="reading"
                    type="number"
                    step="0.001"
                    value={readValue}
                    onChange={(e) => setReadValue(e.target.value)}
                    required
                  />
                  <p className="text-sm text-content-muted">
                    Текущее: {readMeter.lastReadingValue}{' '}
                    {METER_UNIT_LABEL[readMeter.meterType]}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reading-photo">Фото счётчика</Label>
                  <input
                    id="reading-photo"
                    ref={readFileRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    required
                    className="w-full text-sm text-content-secondary file:mr-3 file:rounded-pill file:border file:border-line-strong file:bg-transparent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-content"
                  />
                </div>

                {error && (
                  <p className="flex items-center gap-2 text-sm text-danger">
                    <AlertTriangle aria-hidden className="size-4 shrink-0" />
                    {error}
                  </p>
                )}

                <DialogFooter>
                  <Button type="button" variant="secondary" onClick={closeReading}>
                    Отмена
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy ? 'Отправка…' : 'Отправить'}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        )}
      </Dialog>
    </AppShell>
  );
}

export default function MetersHubPage() {
  return (
    <RequireAuth>
      <MetersHubInner />
    </RequireAuth>
  );
}
