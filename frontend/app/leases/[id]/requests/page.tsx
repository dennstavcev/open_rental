'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Check, Minus, Wrench } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { LeaseTabs } from '@/components/LeaseTabs';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { StatusPill } from '@/components/StatusPill';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getLease, Lease } from '@/lib/leases';
import {
  confirmSettlement,
  createRequest,
  listRequests,
  MaintenanceRequest,
  MaintenanceStatus,
  PAYER_LABEL,
  proposeSettlement,
  SettlementPayer,
  STATUS_LABEL,
  updateStatus,
} from '@/lib/maintenance';
import { formatMoney } from '@/lib/format';
import { usePolling } from '@/lib/usePolling';

/** Тон статуса заявки: открытая требует внимания, в работе — ожидание,
 *  решённая — закрытый вопрос. */
const STATUS_TONE: Record<MaintenanceStatus, 'danger' | 'warn' | 'success'> = {
  open: 'danger',
  in_progress: 'warn',
  resolved: 'success',
};

/** Кто из сторон уже подтвердил урегулирование. Галочка и прочерк —
 *  иконками, а не символами «✓» и «—» в тексте, как было раньше. */
function ConfirmMark({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm ${done ? 'text-success' : 'text-content-muted'}`}
    >
      {done ? (
        <Check aria-hidden className="size-4" />
      ) : (
        <Minus aria-hidden className="size-4" />
      )}
      {label}
    </span>
  );
}

function RequestCard({
  req,
  isTenant,
  isLandlord,
  reload,
}: {
  req: MaintenanceRequest;
  isTenant: boolean;
  isLandlord: boolean;
  reload: () => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState<SettlementPayer>('tenant');
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const canConfirm =
    !req.settlementAppliedAt &&
    req.settlementAmount !== null &&
    ((isTenant && !req.confirmedByTenant) || (isLandlord && !req.confirmedByLandlord));

  return (
    <article className="py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-icon text-content-secondary">
            <Wrench aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-content">{req.category}</h3>
            <p className="mt-1 max-w-prose text-content-secondary">{req.description}</p>
          </div>
        </div>

        {isLandlord ? (
          <div className="max-w-xs text-right">
            <Select
              aria-label="Статус заявки"
              className="h-9 w-auto min-w-40 text-sm"
              value={req.status}
              disabled={busy}
              onChange={(e) =>
                run(() => updateStatus(req.id, e.target.value as MaintenanceStatus))
              }
            >
              <option value="open">Открыта</option>
              <option value="in_progress">В работе</option>
              <option value="resolved">Решена</option>
            </Select>
            {req.service?.billedAt === null && (
              <p className="mt-1 text-xs text-content-muted">
                После закрытия заявки согласованная сумма уйдёт в текущий счёт.
              </p>
            )}
          </div>
        ) : (
          <StatusPill tone={STATUS_TONE[req.status]}>{STATUS_LABEL[req.status]}</StatusPill>
        )}
      </div>

      {req.settlementAmount !== null && (
        <div className="mt-4 rounded-md bg-sand-200/60 px-4 py-3">
          <p className="flex flex-wrap items-baseline gap-x-2 text-content-secondary">
            Урегулирование:
            <span className="text-lg font-bold text-terracotta-500 [font-variant-numeric:tabular-nums]">
              {formatMoney(req.settlementAmount)} ₽
            </span>
            <span>· {req.settlementPayer && PAYER_LABEL[req.settlementPayer]}</span>
          </p>
          {req.service ? (
            <div className="mt-2">
              {req.service.billedAt === null ? (
                <StatusPill tone="warn">
                  Услуга создана — попадёт в счёт после закрытия заявки
                </StatusPill>
              ) : (
                <StatusPill tone="success">
                  {req.settlementPayer === 'owner'
                    ? 'Вычтено из счёта'
                    : 'Выставлено в счёт'}
                </StatusPill>
              )}
            </div>
          ) : req.settlementAppliedAt ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-success">
              <Check aria-hidden className="size-4" />
              согласовано
            </p>
          ) : (
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-sm text-content-muted">подтвердили:</span>
              <ConfirmMark done={req.confirmedByTenant} label="арендатор" />
              <ConfirmMark done={req.confirmedByLandlord} label="собственник" />
            </p>
          )}
        </div>
      )}

      {!req.settlementAppliedAt && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Input
            type="number"
            aria-label="Сумма урегулирования, ₽"
            placeholder="Сумма ₽"
            className="h-10 w-32"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Select
            aria-label="Кто платит"
            className="h-10 w-auto min-w-36"
            value={payer}
            onChange={(e) => setPayer(e.target.value as SettlementPayer)}
          >
            <option value="tenant">Арендатор</option>
            <option value="owner">Собственник</option>
            <option value="split">Пополам</option>
          </Select>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || !amount}
            onClick={() => run(() => proposeSettlement(req.id, Number(amount), payer))}
          >
            Предложить
          </Button>
          {canConfirm && (
            <Button size="sm" disabled={busy} onClick={() => run(() => confirmSettlement(req.id))}>
              Подтвердить
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

function RequestsInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [lease, setLease] = useState<Lease | null>(null);
  const [items, setItems] = useState<MaintenanceRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const isTenant = !!lease && lease.tenantId === user?.id;
  const isLandlord = !!lease && lease.tenantId !== user?.id;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [l, r] = await Promise.all([getLease(id), listRequests(id)]);
      setLease(l);
      setItems(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  usePolling(load, 30000);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createRequest(id, category, description, fileRef.current?.files?.[0]);
      setCategory('');
      setDescription('');
      if (fileRef.current) fileRef.current.value = '';
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка создания');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        back={`/leases/${id}`}
        backLabel="Договор"
        title="Заявки"
        subtitle="Обслуживание и урегулирование"
        action={
          isTenant && items.length > 0 ? (
            <Button className="hidden lg:inline-flex" onClick={() => setShowForm(true)}>
              Новая заявка
            </Button>
          ) : undefined
        }
      />
      <LeaseTabs id={id} />

      {error && (
        <p
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
        >
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Заявок пока нет"
          text={
            isTenant
              ? 'Создайте заявку, если что-то требует ремонта или внимания.'
              : 'Заявки создаёт арендатор.'
          }
          action={
            isTenant ? <Button onClick={() => setShowForm(true)}>Новая заявка</Button> : undefined
          }
        />
      ) : (
        <div className="divide-y divide-line border-y border-line">
          {items.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              isTenant={isTenant}
              isLandlord={isLandlord}
              reload={load}
            />
          ))}
        </div>
      )}

      {isTenant && items.length > 0 && (
        <Fab label="Новая заявка" onClick={() => setShowForm(true)} />
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent title="Новая заявка">
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="req-category">Категория</Label>
              <Input
                id="req-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Сантехника, электрика…"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-description">Описание</Label>
              <Textarea
                id="req-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-photo">Фото (необязательно)</Label>
              <input
                id="req-photo"
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="w-full text-sm text-content-secondary file:mr-3 file:rounded-pill file:border file:border-line-strong file:bg-transparent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-content"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Отправка…' : 'Создать'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export default function RequestsPage() {
  return (
    <RequireAuth>
      <RequestsInner />
    </RequireAuth>
  );
}
