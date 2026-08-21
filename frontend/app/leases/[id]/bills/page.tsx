'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Copy, Wallet } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { LeaseTabs } from '@/components/LeaseTabs';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { Section } from '@/components/Section';
import { StatusPill } from '@/components/StatusPill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getLease, getPayoutDetails, Lease, PayoutDetails } from '@/lib/leases';
import {
  addLineItem,
  BillView,
  claimPaid,
  confirmPaid,
  downloadPaymentProof,
  finalizeBill,
  listBills,
  PAYMENT_STATUS_LABEL,
  waivePenalty,
} from '@/lib/billing';
import { copyText } from '@/lib/clipboard';
import { formatMoney } from '@/lib/format';
import { usePolling } from '@/lib/usePolling';

function BillsInner() {
  const { id } = useParams<{ id: string }>();
  const { user, savePayoutDetails } = useAuth();
  const [lease, setLease] = useState<Lease | null>(null);
  const [bills, setBills] = useState<BillView[]>([]);
  const [payout, setPayout] = useState<PayoutDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetBill, setSheetBill] = useState<string | null>(null);
  const [lineTitle, setLineTitle] = useState('');
  const [lineAmount, setLineAmount] = useState('');
  const [claimBill, setClaimBill] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [payoutSheet, setPayoutSheet] = useState(false);
  const [pPhone, setPPhone] = useState('');
  const [pBank, setPBank] = useState('');
  const [pNote, setPNote] = useState('');
  const proofRef = useRef<HTMLInputElement>(null);

  const isLandlord = !!lease && lease.tenantId !== user?.id;
  const isTenant = !!lease && lease.tenantId === user?.id;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [l, b, p] = await Promise.all([
        getLease(id),
        listBills(id),
        getPayoutDetails(id).catch(() => null),
      ]);
      setLease(l);
      setBills(b);
      setPayout(p);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  usePolling(load, 30000);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка операции');
    } finally {
      setBusy(false);
    }
  }

  async function onAddLine(e: FormEvent) {
    e.preventDefault();
    if (!sheetBill || !lineTitle.trim() || !lineAmount) return;
    const billId = sheetBill;
    await run(() => addLineItem(billId, { title: lineTitle.trim(), amount: Number(lineAmount) }));
    setLineTitle('');
    setLineAmount('');
    setSheetBill(null);
  }

  // Заявление об оплате без чека невозможно (ADR-0019) — файл обязателен и
  // здесь, и на бэкенде.
  async function onClaim(e: FormEvent) {
    e.preventDefault();
    const billId = claimBill;
    const file = proofRef.current?.files?.[0];
    if (!billId || !file) return;
    await run(() => claimPaid(billId, file));
    if (proofRef.current) proofRef.current.value = '';
    setClaimBill(null);
  }

  async function openProof(billId: string) {
    setError(null);
    try {
      const blob = await downloadPaymentProof(billId);
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось открыть чек');
    }
  }

  async function copy(value: string, key: string) {
    if (!(await copyText(value))) {
      setError('Не удалось скопировать — выделите значение вручную');
      return;
    }
    setError(null);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  function openPayoutSheet() {
    setPPhone(user?.payoutPhone ?? '');
    setPBank(user?.payoutBankName ?? '');
    setPNote(user?.payoutNote ?? '');
    setPayoutSheet(true);
  }

  async function onSavePayout(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await savePayoutDetails({
        payoutPhone: pPhone,
        payoutBankName: pBank,
        payoutNote: pNote,
      });
    });
    setPayoutSheet(false);
  }

  const payoutRows: { key: string; label: string; value: string }[] = payout
    ? [
        { key: 'phone', label: 'Телефон (СБП)', value: payout.payoutPhone ?? '' },
        { key: 'bank', label: 'Банк', value: payout.payoutBankName ?? '' },
        { key: 'note', label: 'Комментарий', value: payout.payoutNote ?? '' },
      ].filter((r) => r.value)
    : [];

  return (
    <AppShell>
      <PageHeader
        back={`/leases/${id}`}
        backLabel="Договор"
        title="Счета"
        subtitle="Расчётные периоды и оплата"
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

      {/* Реквизиты — слева отдельной колонкой: на десктопе арендатор
          держит их перед глазами, пока разбирается со счётом. */}
      <div className="lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div>
          {lease && (
            <Section
              title="Куда платить"
              className="mt-0"
              action={
                isLandlord ? (
                  <Button variant="link" size="sm" onClick={openPayoutSheet}>
                    {payout?.filled ? 'Изменить' : 'Заполнить'}
                  </Button>
                ) : undefined
              }
            >
              {payoutRows.length === 0 ? (
                <p className="rounded-md border border-line px-5 py-6 text-center text-content-muted">
                  {isLandlord
                    ? 'Реквизиты не заполнены — арендатору некуда переводить оплату.'
                    : 'Собственник ещё не указал реквизиты для перевода.'}
                </p>
              ) : (
                <Card>
                  {payoutRows.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-label text-content-muted">
                          {row.label}
                        </p>
                        <p className="mt-0.5 font-semibold text-content [overflow-wrap:anywhere]">
                          {row.value}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copy(row.value, row.key)}
                        aria-label={`Копировать: ${row.label}`}
                      >
                        <Copy aria-hidden />
                        {copied === row.key ? 'Скопировано' : 'Копировать'}
                      </Button>
                    </div>
                  ))}
                </Card>
              )}
            </Section>
          )}
        </div>

        <div className="mt-8 lg:mt-0">
          {!lease ? (
            <p className="text-content-muted">Загрузка…</p>
          ) : bills.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Счетов пока нет"
              text="Текущий счёт создаётся автоматически, когда договор активен."
            />
          ) : (
            <div className="divide-y divide-line border-t border-line">
              {bills.map(({ bill, total, accruedPenalty, totalDue, overdue }) => {
                const unpaid = bill.stage === 'final' && bill.paymentStatus !== 'paid';
                return (
                  <article key={bill.id} className="py-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-lg font-bold text-content [font-variant-numeric:tabular-nums]">
                        {bill.periodStart.slice(0, 10)} — {bill.periodEnd.slice(0, 10)}
                      </h3>
                      {bill.stage === 'draft' ? (
                        <StatusPill tone="neutral">черновик</StatusPill>
                      ) : (
                        <StatusPill
                          tone={
                            bill.paymentStatus === 'paid'
                              ? 'success'
                              : overdue
                                ? 'danger'
                                : 'warn'
                          }
                        >
                          {bill.paymentStatus && PAYMENT_STATUS_LABEL[bill.paymentStatus]}
                          {overdue ? ' · просрочен' : ''}
                        </StatusPill>
                      )}
                    </div>

                    {/* Сумма к оплате — самое заметное на экране; просрочка
                        добавляет к размеру ещё и функциональный цвет. */}
                    <p className="mt-3 flex items-baseline gap-2">
                      <span
                        className={`text-4xl font-bold [font-variant-numeric:tabular-nums] ${
                          overdue && unpaid
                            ? 'text-danger'
                            : unpaid
                              ? 'text-terracotta-500'
                              : 'text-content'
                        }`}
                      >
                        {formatMoney(totalDue)} ₽
                      </span>
                      <span className="text-sm text-content-muted">к оплате</span>
                    </p>

                    <dl className="mt-4 border-t border-line pt-3">
                      {bill.lineItems.map((li) => (
                        <div key={li.id} className="flex justify-between gap-4 py-1 text-sm">
                          <dt className="text-content-muted">{li.title}</dt>
                          <dd className="[font-variant-numeric:tabular-nums]">
                            {formatMoney(li.amount)} ₽
                          </dd>
                        </div>
                      ))}
                      {accruedPenalty > 0 && (
                        <div className="flex justify-between gap-4 py-1 text-sm text-terracotta-500">
                          <dt>Пеня{bill.penaltyWaived ? ' (прощена)' : ''}</dt>
                          <dd className="[font-variant-numeric:tabular-nums]">
                            {formatMoney(accruedPenalty)} ₽
                          </dd>
                        </div>
                      )}
                    </dl>

                    {bill.paymentProof && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                        <span className="text-sm text-content-muted">
                          Чек от арендатора · {bill.paymentProof.uploadedAt.slice(0, 10)}
                        </span>
                        <Button variant="link" size="sm" onClick={() => openProof(bill.id)}>
                          Открыть
                        </Button>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-3">
                      {bill.stage === 'draft' && (
                        <>
                          <Button
                            disabled={busy}
                            onClick={() => run(() => finalizeBill(bill.id))}
                          >
                            Сформировать счёт
                          </Button>
                          {isLandlord && (
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => setSheetBill(bill.id)}
                            >
                              Добавить статью
                            </Button>
                          )}
                        </>
                      )}
                      {unpaid && isTenant && (
                        <Button disabled={busy} onClick={() => setClaimBill(bill.id)}>
                          {bill.paymentProof ? 'Заменить чек' : 'Я оплатил'}
                        </Button>
                      )}
                      {unpaid && isLandlord && (
                        <>
                          <Button
                            disabled={busy}
                            onClick={() => run(() => confirmPaid(bill.id))}
                          >
                            Оплата получена
                          </Button>
                          {accruedPenalty > 0 && !bill.penaltyWaived && (
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => run(() => waivePenalty(bill.id))}
                            >
                              Простить пеню
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={sheetBill !== null} onOpenChange={(open) => !open && setSheetBill(null)}>
        <DialogContent title="Добавить статью">
          <form onSubmit={onAddLine} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="line-title">Название</Label>
              <Input
                id="line-title"
                value={lineTitle}
                onChange={(e) => setLineTitle(e.target.value)}
                placeholder="Например, вывоз мусора"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="line-amount">Сумма, ₽</Label>
              <Input
                id="line-amount"
                type="number"
                value={lineAmount}
                onChange={(e) => setLineAmount(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setSheetBill(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={busy}>
                Добавить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={claimBill !== null} onOpenChange={(open) => !open && setClaimBill(null)}>
        <DialogContent title="Подтверждение оплаты">
          <form onSubmit={onClaim} className="space-y-4">
            <p className="max-w-prose text-sm text-content-muted">
              Приложите чек или скриншот перевода — собственник увидит его, когда будет
              подтверждать оплату. Пеня останавливается только после его подтверждения.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="proof">Чек (JPEG, PNG или PDF)</Label>
              <input
                id="proof"
                ref={proofRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                required
                className="w-full text-sm text-content-secondary file:mr-3 file:rounded-pill file:border file:border-line-strong file:bg-transparent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-content"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setClaimBill(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Отправка…' : 'Я оплатил'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={payoutSheet} onOpenChange={setPayoutSheet}>
        <DialogContent title="Реквизиты для перевода">
          <form onSubmit={onSavePayout} className="space-y-4">
            <p className="max-w-prose text-sm text-content-muted">
              Их увидит арендатор на этом экране и сможет скопировать в один клик.
              Реквизиты не попадают в текст договора.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="p-phone">Телефон для СБП</Label>
              <Input
                id="p-phone"
                value={pPhone}
                onChange={(e) => setPPhone(e.target.value)}
                placeholder="+7 900 000-00-00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-bank">Банк-получатель</Label>
              <Input
                id="p-bank"
                value={pBank}
                onChange={(e) => setPBank(e.target.value)}
                placeholder="Т-Банк"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-note">Комментарий (необязательно)</Label>
              <Input
                id="p-note"
                value={pNote}
                onChange={(e) => setPNote(e.target.value)}
                placeholder="Другой способ перевода"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setPayoutSheet(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={busy}>
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export default function BillsPage() {
  return (
    <RequireAuth>
      <BillsInner />
    </RequireAuth>
  );
}
