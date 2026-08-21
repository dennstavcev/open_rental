'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Gauge } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { List, Row } from '@/components/List';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { ApiError } from '@/lib/api';
import { listReadingHistory, MeterReading } from '@/lib/catalog';

function MeterHistoryInner() {
  const { id, meterId } = useParams<{ id: string; meterId: string }>();
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReadings(await listReadingHistory(meterId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [meterId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell>
      <PageHeader
        back={`/leases/${id}/meters`}
        backLabel="Показания"
        title="История показаний"
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

      {loading ? (
        <p className="text-content-muted">Загрузка…</p>
      ) : readings.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="Показаний пока нет"
          text="По этому счётчику ещё не подавали показания в текущем договоре."
        />
      ) : (
        <List className="max-w-prose">
          {readings.map((r) => (
            <Row
              key={r.id}
              icon={Gauge}
              title={r.readingDate.slice(0, 10)}
              value={
                // Показание — то, ради чего экран открыт: крупно и
                // табличными цифрами, чтобы столбец читался вертикально.
                <span className="text-lg font-bold [font-variant-numeric:tabular-nums]">
                  {r.value}
                </span>
              }
            />
          ))}
        </List>
      )}
    </AppShell>
  );
}

export default function MeterHistoryPage() {
  return (
    <RequireAuth>
      <MeterHistoryInner />
    </RequireAuth>
  );
}
