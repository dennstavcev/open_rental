'use client';

import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { PageHeader } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { getSummary, LandlordSummary } from '@/lib/reports';
import { formatMoney } from '@/lib/format';

function ReportsInner() {
  const [data, setData] = useState<LandlordSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getSummary());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <TopBar />
      <div className="container">
        <PageHeader title="Отчёты" subtitle="Доходы, задолженность и сроки договоров" />
        {error && <div className="error">{error}</div>}
        {!data ? (
          <p className="muted">Загрузка…</p>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat">
                <div className="num">{formatMoney(data.income.total)} ₽</div>
                <div className="label">Получено всего</div>
              </div>
              <div className="stat">
                <div className="num">{formatMoney(data.outstanding.totalDue)} ₽</div>
                <div className="label">К оплате</div>
              </div>
              <div className="stat">
                <div className="num">{data.outstanding.overdue.length}</div>
                <div className="label">Просроченных счетов</div>
              </div>
            </div>

            <h2>Доходы по месяцам</h2>
            {data.income.byMonth.length === 0 ? (
              <div className="empty">Оплат пока не было.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Месяц</th>
                      <th className="num">Сумма, ₽</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.income.byMonth.map((m) => (
                      <tr key={m.month}>
                        <td>{m.month}</td>
                        <td className="num">{formatMoney(m.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2>Просрочки</h2>
            {data.outstanding.overdue.length === 0 ? (
              <div className="empty">Просрочек нет.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Объект</th>
                      <th className="num">К оплате, ₽</th>
                      <th className="num">Просрочка</th>
                      <th>Арендатор</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.outstanding.overdue.map((o) => (
                      <tr key={o.billId}>
                        <td>{o.propertyAddress}</td>
                        <td className="num">{formatMoney(o.totalDue)}</td>
                        <td className="num">{o.daysOverdue} дн.</td>
                        <td className="muted">{o.tenantEmail ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2>
              Сроки договоров{' '}
              <span className="muted" style={{ fontWeight: 400 }}>
                (30 дн. — {data.leaseExpirations.within30}, 60 —{' '}
                {data.leaseExpirations.within60}, 90 —{' '}
                {data.leaseExpirations.within90})
              </span>
            </h2>
            {data.leaseExpirations.expiringSoon.length === 0 ? (
              <div className="empty">Нет договоров, истекающих в ближайшие 90 дней.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Объект</th>
                      <th>Дата окончания</th>
                      <th className="num">Осталось</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.leaseExpirations.expiringSoon.map((l) => (
                      <tr key={l.leaseId}>
                        <td>{l.propertyAddress}</td>
                        <td>{l.endDate.slice(0, 10)}</td>
                        <td className="num">{l.daysUntilEnd} дн.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function ReportsPage() {
  return (
    <RequireAuth>
      <ReportsInner />
    </RequireAuth>
  );
}
