'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
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
  const [lineTitle, setLineTitle] = useState<Record<string, string>>({});
  const [lineAmount, setLineAmount] = useState<Record<string, string>>({});

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

  async function onAddLine(billId: string, e: FormEvent) {
    e.preventDefault();
    const title = lineTitle[billId]?.trim();
    const amount = Number(lineAmount[billId]);
    if (!title || !amount) return;
    await run(() => addLineItem(billId, { title, amount }));
    setLineTitle((s) => ({ ...s, [billId]: '' }));
    setLineAmount((s) => ({ ...s, [billId]: '' }));
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <h1>Счета по договору</h1>
        {error && <div className="error">{error}</div>}
        {!lease ? (
          <p className="muted">Загрузка…</p>
        ) : bills.length === 0 ? (
          <div className="empty">
            Счета появятся, когда договор активен (текущий черновик создаётся
            автоматически).
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Период / позиции</th>
                    <th>Статус</th>
                    <th className="num">Сумма</th>
                    <th className="num">Пеня</th>
                    <th className="num">К оплате</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map(({ bill, total, accruedPenalty, totalDue, overdue }) => (
                    <tr key={bill.id}>
                      <td>
                        <strong>
                          {bill.periodStart.slice(0, 10)} — {bill.periodEnd.slice(0, 10)}
                        </strong>
                        <div className="muted">
                          {bill.lineItems.map((li) => `${li.title} ${li.amount}₽`).join(' · ')}
                        </div>
                      </td>
                      <td>
                        {bill.stage === 'draft' ? (
                          <span className="pill">черновик</span>
                        ) : (
                          <span
                            className={`pill ${bill.paymentStatus === 'paid' ? 'ok' : overdue ? 'warn' : ''}`}
                          >
                            {bill.paymentStatus && PAYMENT_STATUS_LABEL[bill.paymentStatus]}
                            {overdue ? ' · просрочен' : ''}
                          </span>
                        )}
                      </td>
                      <td className="num">{total}</td>
                      <td className="num">
                        {accruedPenalty > 0
                          ? `${accruedPenalty}${bill.penaltyWaived ? ' (прощена)' : ''}`
                          : '—'}
                      </td>
                      <td className="num">
                        <strong>{totalDue}</strong>
                      </td>
                      <td>
                        <div className="table-actions">
                          {bill.stage === 'draft' && (
                            <button disabled={busy} onClick={() => run(() => finalizeBill(bill.id))}>
                              Сформировать
                            </button>
                          )}
                          {bill.stage === 'final' &&
                            bill.paymentStatus === 'pending' &&
                            isTenant && (
                              <button disabled={busy} onClick={() => run(() => claimPaid(bill.id))}>
                                Я оплатил
                              </button>
                            )}
                          {bill.stage === 'final' &&
                            bill.paymentStatus !== 'paid' &&
                            isLandlord && (
                              <>
                                <button disabled={busy} onClick={() => run(() => confirmPaid(bill.id))}>
                                  Оплата получена
                                </button>
                                {accruedPenalty > 0 && !bill.penaltyWaived && (
                                  <button
                                    className="secondary"
                                    disabled={busy}
                                    onClick={() => run(() => waivePenalty(bill.id))}
                                  >
                                    Простить пеню
                                  </button>
                                )}
                              </>
                            )}
                          {bill.stage === 'final' && bill.paymentStatus === 'paid' && (
                            <span className="muted">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isLandlord &&
              bills.some((b) => b.bill.stage === 'draft') &&
              (() => {
                const draftId = bills.find((b) => b.bill.stage === 'draft')!.bill.id;
                return (
                  <form
                    className="card"
                    onSubmit={(e) => onAddLine(draftId, e)}
                    style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
                  >
                    <div className="field" style={{ margin: 0 }}>
                      <label>Статья в текущий черновик</label>
                      <input
                        placeholder="Название"
                        value={lineTitle[draftId] ?? ''}
                        onChange={(e) => setLineTitle((s) => ({ ...s, [draftId]: e.target.value }))}
                      />
                    </div>
                    <input
                      type="number"
                      placeholder="₽"
                      value={lineAmount[draftId] ?? ''}
                      onChange={(e) => setLineAmount((s) => ({ ...s, [draftId]: e.target.value }))}
                    />
                    <button className="secondary" type="submit" disabled={busy}>
                      Добавить статью
                    </button>
                  </form>
                );
              })()}
          </>
        )}
      </div>
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
