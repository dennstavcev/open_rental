'use client';

import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Icon, List, PageHeader } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { listNotifications, markRead, Notification } from '@/lib/notifications';

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

  async function onRead(id: string) {
    try {
      await markRead(id);
      await load();
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <PageHeader title="Уведомления" subtitle="События по вашим договорам" />
        {error && <div className="error">{error}</div>}

        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : items.length === 0 ? (
          <EmptyState icon="bell" title="Уведомлений нет" text="Здесь появятся важные события: оплаты, показания, статусы договоров." />
        ) : (
          <List>
            {items.map((n) => (
              <div
                key={n.id}
                className="row"
                style={{ cursor: n.readAt ? 'default' : 'pointer', opacity: n.readAt ? 0.6 : 1 }}
                onClick={() => !n.readAt && onRead(n.id)}
              >
                <span className={`lead ${n.readAt ? '' : 'warm'}`}>
                  <Icon name="bell" />
                </span>
                <span className="body">
                  <span className="t">{n.title}</span>
                  <span className="s" style={{ whiteSpace: 'normal' }}>
                    {n.body}
                  </span>
                </span>
                <span className="trail" style={{ fontSize: 'var(--text-xs)' }}>
                  {n.createdAt.slice(5, 16).replace('T', ' ')}
                </span>
              </div>
            ))}
          </List>
        )}
      </div>
    </>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsInner />
    </RequireAuth>
  );
}
