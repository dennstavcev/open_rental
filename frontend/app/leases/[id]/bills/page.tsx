'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { EmptyState, LeaseTabs, PageHeader, Section, Sheet } from '@/components/ui';
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
    <>
      <TopBar />
      <div className="container">
        <PageHeader back={`/leases/${id}`} title="Счета" subtitle="Расчётные периоды и оплата" />
        <LeaseTabs id={id} />
        {error && <div className="error">{error}</div>}

        {lease && (
          <Section
            title="Куда платить"
            action={
              isLandlord ? (
                <button className="link" onClick={openPayoutSheet}>
                  {payout?.filled ? 'Изменить' : 'Заполнить'}
                </button>
              ) : undefined
            }
          >
            {payoutRows.length === 0 ? (
              <div className="empty">
                {isLandlord
                  ? 'Реквизиты не заполнены — арендатору некуда переводить оплату.'
                  : 'Собственник ещё не указал реквизиты для перевода.'}
              </div>
            ) : (
              <div className="card">
                {payoutRows.map((row) => (
                  <div
                    key={row.key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      padding: '4px 0',
                    }}
                  >
                    <span className="muted">{row.label}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ overflowWrap: 'anywhere' }}>{row.value}</span>
                      <button className="link" onClick={() => copy(row.value, row.key)}>
                        {copied === row.key ? 'Скопировано' : 'Копировать'}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {!lease ? (
          <p className="muted">Загрузка…</p>
        ) : bills.length === 0 ? (
          <EmptyState icon="wallet" title="Счетов пока нет" text="Текущий счёт создаётся автоматически, когда договор активен." />
        ) : (
          bills.map(({ bill, total, accruedPenalty, totalDue, overdue }) => (
            <div className="card" key={bill.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <strong>{bill.periodStart.slice(0, 10)} — {bill.periodEnd.slice(0, 10)}</strong>
                {bill.stage === 'draft' ? (
                  <span className="pill">черновик</span>
                ) : (
                  <span className={`pill ${bill.paymentStatus === 'paid' ? 'ok' : overdue ? 'warn' : ''}`}>
                    {bill.paymentStatus && PAYMENT_STATUS_LABEL[bill.paymentStatus]}
                    {overdue ? ' · просрочен' : ''}
                  </span>
                )}
              </div>

              <div className="money" style={{ margin: '12px 0 6px' }}>
                <span className={`amount ${bill.paymentStatus !== 'paid' && bill.stage === 'final' ? 'due' : ''}`}>
                  {formatMoney(totalDue)} ₽
                </span>
                <span className="muted">к оплате</span>
              </div>

              <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 10, marginTop: 6 }}>
                {bill.lineItems.map((li) => (
                  <div key={li.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', padding: '3px 0' }}>
                    <span className="muted">{li.title}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(li.amount)} ₽</span>
                  </div>
                ))}
                {accruedPenalty > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', padding: '3px 0', color: 'var(--terracotta-500)' }}>
                    <span>Пеня{bill.penaltyWaived ? ' (прощена)' : ''}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(accruedPenalty)} ₽</span>
                  </div>
                )}
              </div>

              {bill.paymentProof && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border-default)',
                  }}
                >
                  <span className="muted">
                    Чек от арендатора · {bill.paymentProof.uploadedAt.slice(0, 10)}
                  </span>
                  <button className="link" onClick={() => openProof(bill.id)}>
                    Открыть
                  </button>
                </div>
              )}

              <div className="table-actions" style={{ marginTop: 14 }}>
                {bill.stage === 'draft' && (
                  <>
                    <button disabled={busy} onClick={() => run(() => finalizeBill(bill.id))}>Сформировать счёт</button>
                    {isLandlord && (
                      <button className="secondary" disabled={busy} onClick={() => setSheetBill(bill.id)}>+ Статья</button>
                    )}
                  </>
                )}
                {bill.stage === 'final' && bill.paymentStatus !== 'paid' && isTenant && (
                  <button disabled={busy} onClick={() => setClaimBill(bill.id)}>
                    {bill.paymentProof ? 'Заменить чек' : 'Я оплатил'}
                  </button>
                )}
                {bill.stage === 'final' && bill.paymentStatus !== 'paid' && isLandlord && (
                  <>
                    <button disabled={busy} onClick={() => run(() => confirmPaid(bill.id))}>Оплата получена</button>
                    {accruedPenalty > 0 && !bill.penaltyWaived && (
                      <button className="secondary" disabled={busy} onClick={() => run(() => waivePenalty(bill.id))}>Простить пеню</button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {sheetBill && (
        <Sheet title="Добавить статью" onClose={() => setSheetBill(null)}>
          <form onSubmit={onAddLine}>
            <div className="field">
              <label>Название</label>
              <input value={lineTitle} onChange={(e) => setLineTitle(e.target.value)} placeholder="Например, вывоз мусора" required />
            </div>
            <div className="field">
              <label>Сумма, ₽</label>
              <input type="number" value={lineAmount} onChange={(e) => setLineAmount(e.target.value)} required />
            </div>
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={() => setSheetBill(null)}>Отмена</button>
              <button type="submit" disabled={busy}>Добавить</button>
            </div>
          </form>
        </Sheet>
      )}

      {claimBill && (
        <Sheet title="Подтверждение оплаты" onClose={() => setClaimBill(null)}>
          <form onSubmit={onClaim}>
            <div className="hint">
              Приложите чек или скриншот перевода — собственник увидит его,
              когда будет подтверждать оплату. Пеня останавливается только
              после его подтверждения.
            </div>
            <div className="field">
              <label>Чек (JPEG, PNG или PDF)</label>
              <input ref={proofRef} type="file" accept="image/jpeg,image/png,application/pdf" required />
            </div>
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={() => setClaimBill(null)}>Отмена</button>
              <button type="submit" disabled={busy}>{busy ? 'Отправка…' : 'Я оплатил'}</button>
            </div>
          </form>
        </Sheet>
      )}

      {payoutSheet && (
        <Sheet title="Реквизиты для перевода" onClose={() => setPayoutSheet(false)}>
          <form onSubmit={onSavePayout}>
            <div className="hint">
              Их увидит арендатор на этом экране и сможет скопировать в один
              клик. Реквизиты не попадают в текст договора.
            </div>
            <div className="field">
              <label>Телефон для СБП</label>
              <input value={pPhone} onChange={(e) => setPPhone(e.target.value)} placeholder="+7 900 000-00-00" />
            </div>
            <div className="field">
              <label>Банк-получатель</label>
              <input value={pBank} onChange={(e) => setPBank(e.target.value)} placeholder="Т-Банк" />
            </div>
            <div className="field">
              <label>Комментарий (необязательно)</label>
              <input value={pNote} onChange={(e) => setPNote(e.target.value)} placeholder="Другой способ перевода" />
            </div>
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={() => setPayoutSheet(false)}>Отмена</button>
              <button type="submit" disabled={busy}>Сохранить</button>
            </div>
          </form>
        </Sheet>
      )}
    </>
  );
}

export default function BillsPage() {
  return (
    <RequireAuth>
      <BillsInner />
    </RequireAuth>
  );
}
