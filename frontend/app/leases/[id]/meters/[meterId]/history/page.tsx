'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { EmptyState, List, PageHeader, Row } from '@/components/ui';
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
    <>
      <TopBar />
      <div className="container">
        <PageHeader back={`/leases/${id}/meters`} title="История показаний" />
        {error && <div className="error">{error}</div>}

        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : readings.length === 0 ? (
          <EmptyState icon="gauge" title="Показаний пока нет" text="По этому счётчику ещё не подавали показания в текущем договоре." />
        ) : (
          <List>
            {readings.map((r) => (
              <Row
                key={r.id}
                icon="gauge"
                title={r.value}
                subtitle={r.readingDate.slice(0, 10)}
                chevron={false}
              />
            ))}
          </List>
        )}
      </div>
    </>
  );
}

export default function MeterHistoryPage() {
  return (
    <RequireAuth>
      <MeterHistoryInner />
    </RequireAuth>
  );
}
