'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Icon, LeaseTabs, PageHeader, Sheet } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { listMetersForLease, submitReading, Meter, METER_UNIT_LABEL } from '@/lib/catalog';
import { usePolling } from '@/lib/usePolling';

const METER_BADGE_ICON: Record<Meter['meterType'], string> = {
  electricity: 'bolt',
  water: 'droplet',
  gas: 'flame',
  heating: 'flame',
};

function MetersHubInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [meters, setMeters] = useState<Meter[]>([]);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [readMeter, setReadMeter] = useState<Meter | null>(null);
  const [readValue, setReadValue] = useState('');
  const readFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const view = await listMetersForLease(id);
      setMeters(view.meters);
      setPeriodStart(view.periodStart.slice(0, 10));
      setPeriodEnd(view.periodEnd.slice(0, 10));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  usePolling(load, 30000);

  function openReading(m: Meter) {
    setReadMeter(m);
    setReadValue(String(m.lastReadingValue));
  }

  async function onSubmitReading(e: FormEvent) {
    e.preventDefault();
    const photo = readFileRef.current?.files?.[0];
    if (!photo || !readValue || !readMeter) return;
    setBusy(true);
    setError(null);
    try {
      await submitReading(readMeter.id, Number(readValue), photo);
      setReadMeter(null);
      setReadValue('');
      if (readFileRef.current) readFileRef.current.value = '';
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка отправки');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <PageHeader back={`/leases/${id}`} title="Показания" subtitle="Счётчики по этому договору" />
        <LeaseTabs id={id} />
        {error && <div className="error">{error}</div>}

        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : meters.length === 0 ? (
          <EmptyState icon="gauge" title="Счётчиков пока нет" text="Собственник ещё не добавил счётчики по этому объекту." />
        ) : (
          meters.map((m) => (
            <div className="card" key={m.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={`meter-badge ${m.meterType}`}>
                  <Icon name={METER_BADGE_ICON[m.meterType]} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <strong>{m.name}</strong>
                  {m.serialNumber && <div className="muted">№ {m.serialNumber}</div>}
                </div>
              </div>

              <div className="kv-block">
                {m.calibrationDueDate && (
                  <div className="kv">
                    <span className="k">Поверка счётчика</span>
                    <span>{m.calibrationDueDate.slice(0, 10)}</span>
                  </div>
                )}
                <div className="kv">
                  <span className="k">Текущий период</span>
                  <span>{periodStart} — {periodEnd}</span>
                </div>
              </div>

              {m.isActive && (
                <div className={`status-banner ${m.currentPeriodSubmitted ? 'done' : 'due'}`}>
                  <Icon name={m.currentPeriodSubmitted ? 'check' : 'info'} />
                  <span>
                    {m.currentPeriodSubmitted
                      ? 'Показания внесены'
                      : `Внесите показания до ${periodEnd}`}
                  </span>
                </div>
              )}

              <div className="sheet-actions" style={{ marginTop: 10 }}>
                <button
                  className="secondary"
                  onClick={() => router.push(`/leases/${id}/meters/${m.id}/history`)}
                >
                  История
                </button>
                {m.isActive && !m.currentPeriodSubmitted && (
                  <button onClick={() => openReading(m)}>Внести</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {readMeter && (
        <Sheet title={`Показание · ${readMeter.name}`} onClose={() => setReadMeter(null)}>
          <form onSubmit={onSubmitReading}>
            <div className="field">
              <label>Новое показание, {METER_UNIT_LABEL[readMeter.meterType]}</label>
              <input type="number" step="0.001" value={readValue} onChange={(e) => setReadValue(e.target.value)} required />
              <p className="muted">Текущее: {readMeter.lastReadingValue} {METER_UNIT_LABEL[readMeter.meterType]}</p>
            </div>
            <div className="field">
              <label>Фото счётчика</label>
              <input ref={readFileRef} type="file" accept="image/jpeg,image/png" required />
            </div>
            {error && <div className="error">{error}</div>}
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={() => setReadMeter(null)}>Отмена</button>
              <button type="submit" disabled={busy}>{busy ? 'Отправка…' : 'Отправить'}</button>
            </div>
          </form>
        </Sheet>
      )}
    </>
  );
}

export default function MetersHubPage() {
  return (
    <RequireAuth>
      <MetersHubInner />
    </RequireAuth>
  );
}
