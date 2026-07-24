'use client';

import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Icon, PageHeader } from '@/components/ui';
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
        <PageHeader title="Приглашения" subtitle="Договоры, куда вас пригласили арендатором" />
        {error && <div className="error">{error}</div>}

        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : items.length === 0 ? (
          <EmptyState icon="mail" title="Новых приглашений нет" text="Когда собственник отправит вам договор, приглашение появится здесь." />
        ) : (
          items.map((inv) => (
            <div className="card" key={inv.id}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span className="lead warm">
                  <Icon name="mail" />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'var(--weight-semibold)' }}>
                    Приглашение на договор
                  </div>
                  <div className="muted">{inv.invitedEmail}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  style={{ flex: 1 }}
                  disabled={busyId === inv.id}
                  onClick={() => act(inv.id, true)}
                >
                  Принять
                </button>
                <button
                  className="secondary"
                  style={{ flex: 1 }}
                  disabled={busyId === inv.id}
                  onClick={() => act(inv.id, false)}
                >
                  Отклонить
                </button>
              </div>
            </div>
          ))
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
