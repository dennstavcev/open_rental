'use client';

import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { ApiError } from '@/lib/api';
import {
  acceptInvitation,
  declineInvitation,
  Invitation,
  listInvitations,
} from '@/lib/leases';

function InvitationsInner() {
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listInvitations());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, accept: boolean) {
    setBusyId(id);
    setError(null);
    try {
      await (accept ? acceptInvitation(id) : declineInvitation(id));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <h1>Приглашения</h1>
        {error && <div className="error">{error}</div>}
        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : items.length === 0 ? (
          <div className="empty">Новых приглашений нет.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Договор</th>
                  <th>Email</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <strong>{inv.leaseId.slice(0, 8)}</strong>
                    </td>
                    <td className="muted">{inv.invitedEmail}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          disabled={busyId === inv.id}
                          onClick={() => act(inv.id, true)}
                        >
                          Принять
                        </button>
                        <button
                          className="secondary"
                          disabled={busyId === inv.id}
                          onClick={() => act(inv.id, false)}
                        >
                          Отклонить
                        </button>
                      </div>
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

export default function InvitationsPage() {
  return (
    <RequireAuth>
      <InvitationsInner />
    </RequireAuth>
  );
}
