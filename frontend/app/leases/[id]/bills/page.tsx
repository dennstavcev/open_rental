'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { EmptyState, LeaseTabs, PageHeader, Sheet } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getLease, Lease } from '@/lib/leases';
import {
  addLineItem,
  BillView,
  claimPaid,
  confirmPaid,
  finalizeBill,
  listBills,
  PAYMENT_STATUS_LABEL,
  waivePenalty,
} from '@/lib/billing';

function BillsInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [lease, setLease] = useState<Lease | null>(null);
  const [bills, setBills] = useState<BillView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetBill, setSheetBill] = useState<string | null>(null);
  const [lineTitle, setLineTitle] = useState('');
  const [lineAmount, setLineAmount] = useState('');

  const isLandlord = !!lease && lease.tenantId !== user?.id;
  const isTenant = !!lease && lease.tenantId === user?.id;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [l, b] = await Promise.all([getLease(id), listBills(id)]);
      setLease(l);
      setBills(b);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <>
      <TopBar />
      <div className="container">
        <PageHeader back={`/leases/${id}`} title="Счета" subtitle="Расчётные периоды и оплата" />
        <LeaseTabs id={id} />
        {error && <div className="error">{error}</div>}

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
                  {totalDue.toLocaleString('ru')} ₽
                </span>
                <span className="muted">к оплате</span>
              </div>

              <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 10, marginTop: 6 }}>
                {bill.lineItems.map((li) => (
                  <div key={li.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', padding: '3px 0' }}>
                    <span className="muted">{li.title}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{li.amount} ₽</span>
                  </div>
                ))}
                {accruedPenalty > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', padding: '3px 0', color: 'var(--terracotta-500)' }}>
                    <span>Пеня{bill.penaltyWaived ? ' (прощена)' : ''}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{accruedPenalty} ₽</span>
                  </div>
                )}
              </div>

              <div className="table-actions" style={{ marginTop: 14 }}>
                {bill.stage === 'draft' && (
                  <>
                    <button disabled={busy} onClick={() => run(() => finalizeBill(bill.id))}>Сформировать счёт</button>
                    {isLandlord && (
                      <button className="secondary" disabled={busy} onClick={() => setSheetBill(bill.id)}>+ Статья</button>
                    )}
                  </>
                )}
                {bill.stage === 'final' && bill.paymentStatus === 'pending' && isTenant && (
                  <button disabled={busy} onClick={() => run(() => claimPaid(bill.id))}>Я оплатил</button>
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
