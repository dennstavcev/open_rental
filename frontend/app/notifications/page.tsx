'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { listNotifications, markRead, Notification } from '@/lib/notifications';
import { usePolling } from '@/lib/usePolling';

function NotificationsInner() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await listNotifications());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  usePolling(load, 30000);

  async function onRead(id: string) {
    try {
      await markRead(id);
      await load();
    } catch {
      /* ignore */
    }
  }

  return (
    <AppShell>
      <PageHeader title="Уведомления" subtitle="События по вашим договорам" />

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="divide-y divide-line border-y border-line">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4 py-4">
              <Skeleton className="size-10 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Уведомлений нет"
          text="Здесь появятся важные события: оплаты, показания, статусы договоров."
        />
      ) : (
        <ul className="max-w-3xl divide-y divide-line border-y border-line">
          {items.map((n) => {
            const unread = !n.readAt;
            const body = (
              <>
                {/* Непрочитанное помечено полоской и весом текста, а не
                    цветной точкой: красный в системе означает просрочку. */}
                <span
                  aria-hidden
                  className={`w-[3px] shrink-0 self-stretch rounded-pill ${unread ? 'bg-sand-300' : 'bg-transparent'}`}
                />
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-icon text-content-secondary">
                  <Bell aria-hidden className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block break-words ${unread ? 'font-semibold text-content' : 'text-content-secondary'}`}
                  >
                    {n.title}
                  </span>
                  <span className="mt-0.5 block break-words text-sm text-content-muted">
                    {n.body}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-content-muted [font-variant-numeric:tabular-nums]">
                  {n.createdAt.slice(5, 16).replace('T', ' ')}
                </span>
              </>
            );

            return (
              <li key={n.id}>
                {unread ? (
                  <button
                    type="button"
                    onClick={() => onRead(n.id)}
                    className="flex w-full items-center gap-3 py-4 pr-1 text-left transition-colors duration-fast hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 py-4 pr-1">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsInner />
    </RequireAuth>
  );
}
