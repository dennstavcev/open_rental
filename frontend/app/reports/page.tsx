'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { Section } from '@/components/Section';
import { Stat, StatRow } from '@/components/Stat';
import { Skeleton } from '@/components/ui/skeleton';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
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
    <AppShell>
      <PageHeader title="Отчёты" subtitle="Доходы, задолженность и сроки договоров" />

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {!data ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-md" />
          <Skeleton className="h-40 w-full rounded-md" />
        </div>
      ) : (
        <>
          <StatRow>
            <Stat
              label="Получено всего"
              value={`${formatMoney(data.income.total)} ₽`}
              tone="money"
            />
            <Stat label="К оплате" value={`${formatMoney(data.outstanding.totalDue)} ₽`} />
            <Stat
              label="Просроченных счетов"
              value={data.outstanding.overdue.length}
              tone={data.outstanding.overdue.length > 0 ? 'danger' : 'ink'}
              icon={
                data.outstanding.overdue.length > 0 ? (
                  <AlertTriangle aria-hidden className="size-6" />
                ) : undefined
              }
            />
          </StatRow>

          {/* Три таблицы вместо одной сводной: у них разные ключи и
              разные вопросы — «сколько пришло», «кто должен», «что скоро
              заканчивается». */}
          <div className="mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10">
            <div>
              <Section title="Доходы по месяцам">
                {data.income.byMonth.length === 0 ? (
                  <p className="rounded-md border border-line px-5 py-6 text-center text-content-muted">
                    Оплат пока не было.
                  </p>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Месяц</TH>
                        <TH numeric>Сумма, ₽</TH>
                      </TR>
                    </THead>
                    <tbody>
                      {data.income.byMonth.map((m) => (
                        <TR key={m.month}>
                          <TD>{m.month}</TD>
                          <TD numeric className="font-semibold">
                            {formatMoney(m.amount)}
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Section>

              <Section title="Просрочки">
                {data.outstanding.overdue.length === 0 ? (
                  <p className="rounded-md border border-line px-5 py-6 text-center text-content-muted">
                    Просрочек нет.
                  </p>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Объект</TH>
                        <TH numeric>К оплате, ₽</TH>
                        <TH numeric>Просрочка</TH>
                        <TH>Арендатор</TH>
                      </TR>
                    </THead>
                    <tbody>
                      {data.outstanding.overdue.map((o) => (
                        <TR key={o.billId}>
                          <TD>{o.propertyAddress}</TD>
                          <TD numeric className="font-bold text-danger">
                            {formatMoney(o.totalDue)}
                          </TD>
                          <TD numeric>
                            <span className="inline-flex items-center gap-1.5 text-danger">
                              <AlertTriangle aria-hidden className="size-4" />
                              {o.daysOverdue} дн.
                            </span>
                          </TD>
                          <TD className="text-content-muted [overflow-wrap:anywhere]">
                            {o.tenantEmail ?? '—'}
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Section>
            </div>

            <Section
              title="Сроки договоров"
              className="lg:mt-8"
              action={
                <span className="text-content-muted">
                  30 дн. — {data.leaseExpirations.within30}, 60 —{' '}
                  {data.leaseExpirations.within60}, 90 — {data.leaseExpirations.within90}
                </span>
              }
            >
              {data.leaseExpirations.expiringSoon.length === 0 ? (
                <p className="rounded-md border border-line px-5 py-6 text-center text-content-muted">
                  Нет договоров, истекающих в ближайшие 90 дней.
                </p>
              ) : (
                <ul className="divide-y divide-line border-y border-line">
                  {data.leaseExpirations.expiringSoon.map((l) => (
                    <li key={l.leaseId} className="flex items-center justify-between gap-4 py-4">
                      <span className="min-w-0">
                        <span className="block break-words font-semibold text-content">
                          {l.propertyAddress}
                        </span>
                        <span className="text-sm text-content-muted [font-variant-numeric:tabular-nums]">
                          до {l.endDate.slice(0, 10)}
                        </span>
                      </span>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 font-bold [font-variant-numeric:tabular-nums] ${
                          l.daysUntilEnd <= 30 ? 'text-warn' : 'text-content'
                        }`}
                      >
                        {l.daysUntilEnd <= 30 && <Clock aria-hidden className="size-4" />}
                        {l.daysUntilEnd} дн.
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </>
      )}
    </AppShell>
  );
}

export default function ReportsPage() {
  return (
    <RequireAuth>
      <ReportsInner />
    </RequireAuth>
  );
}
