'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import {
  acceptInvitation,
  declineInvitation,
  Invitation,
  listInvitations,
} from '@/lib/leases';
import { notifyInvitationsChanged } from '@/lib/events';
import { usePolling } from '@/lib/usePolling';

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
  usePolling(load, 30000);

  async function act(id: string, accept: boolean) {
    setBusyId(id);
    setError(null);
    try {
      await (accept ? acceptInvitation(id) : declineInvitation(id));
      notifyInvitationsChanged();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <PageHeader title="Приглашения" subtitle="Договоры, куда вас пригласили арендатором" />

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-content-muted">Загрузка…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Новых приглашений нет"
          text="Когда собственник отправит вам договор, приглашение появится здесь."
        />
      ) : (
        <div className="space-y-4">
          {items.map((inv) => (
            // Приглашение — единственное действие экрана, поэтому здесь
            // карточка уместна: ей нужна элевация.
            <Card key={inv.id} className="lg:flex lg:items-center lg:gap-8 lg:p-5">
              <div className="flex min-w-0 items-start gap-4 p-5 lg:flex-1 lg:p-0">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-icon text-content-secondary">
                  <Mail aria-hidden className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-lg font-bold text-content [overflow-wrap:anywhere]">
                    {inv.property.address}
                  </p>
                  <p className="mt-0.5 text-sm text-content-muted [overflow-wrap:anywhere]">
                    Приглашает {inv.landlord.fullName} · {inv.landlord.email}
                  </p>
                </div>
              </div>

              <dl className="flex flex-wrap gap-x-8 gap-y-3 border-t border-line px-5 py-4 lg:shrink-0 lg:border-l lg:border-t-0 lg:py-0 lg:pr-0">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-label text-content-muted">
                    Аренда
                  </dt>
                  <dd className="mt-1 text-xl font-bold text-terracotta-500 [font-variant-numeric:tabular-nums]">
                    {formatMoney(inv.lease.rentAmount)} ₽/мес
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-label text-content-muted">
                    Срок
                  </dt>
                  <dd className="mt-1 font-semibold text-content [font-variant-numeric:tabular-nums]">
                    {inv.lease.startDate.slice(0, 10)} — {inv.lease.endDate.slice(0, 10)}
                  </dd>
                </div>
              </dl>

              <div className="flex gap-3 border-t border-line px-5 py-4 lg:shrink-0 lg:flex-col lg:border-t-0 lg:p-0">
                <Button
                  className="flex-1 lg:flex-none"
                  disabled={busyId === inv.id}
                  onClick={() => act(inv.id, true)}
                >
                  Принять
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1 lg:flex-none"
                  disabled={busyId === inv.id}
                  onClick={() => act(inv.id, false)}
                >
                  Отклонить
                </Button>
              </div>
            </Card>
          ))}

          <p className="max-w-prose text-sm text-content-muted">
            Приняв приглашение, вы становитесь арендатором по этому договору.
          </p>
        </div>
      )}
    </AppShell>
  );
}

export default function InvitationsPage() {
  return (
    <RequireAuth>
      <InvitationsInner />
    </RequireAuth>
  );
}
