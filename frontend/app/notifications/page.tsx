'use client';

import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { ApiError } from '@/lib/api';
import { listNotifications, markRead, Notification } from '@/lib/notifications';

function NotificationsInner() {
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await listNotifications());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
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
        <h1>Уведомления</h1>
        {error && <div className="error">{error}</div>}
        {items.length === 0 ? (
          <div className="empty">Уведомлений нет.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Уведомление</th>
                  <th>Дата</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((n) => (
                  <tr key={n.id} style={{ opacity: n.readAt ? 0.55 : 1 }}>
                    <td>
                      <strong>{n.title}</strong>
                      <div className="muted">{n.body}</div>
                    </td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {n.createdAt.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td>
                      {n.readAt ? (
                        <span className="pill">прочитано</span>
                      ) : (
                        <button className="secondary" onClick={() => onRead(n.id)}>
                          Прочитано
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
