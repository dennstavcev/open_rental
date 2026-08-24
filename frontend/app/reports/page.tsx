'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Building2, Clock } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { Section } from '@/components/Section';
import { Stat, StatRow } from '@/components/Stat';
import { StatusPill, StatusTone } from '@/components/StatusPill';
import { Skeleton } from '@/components/ui/skeleton';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import {
  getSummary,
  LandlordSummary,
  PortfolioEntry,
  PortfolioStatus,
} from '@/lib/reports';
import { formatMoney } from '@/lib/format';

const PORTFOLIO_STATUS: Record<
  PortfolioStatus,
  { label: string; tone: StatusTone }
> = {
  rented: { label: 'Сдан', tone: 'success' },
  pending: { label: 'Ожидает арендатора', tone: 'warn' },
  vacant: { label: 'Свободен', tone: 'neutral' },
};

function signedMoney(value: number): string {
  return `${value > 0 ? '+' : '−'}${formatMoney(Math.abs(value))}`;
}

function PortfolioSection({ portfolio }: { portfolio: LandlordSummary['portfolio'] }) {
  const groups = useMemo(() => {
    const grouped = new Map<string | null, PortfolioEntry[]>();
    for (const entry of portfolio.entries) {
      const city = entry.city?.trim() || null;
      grouped.set(city, [...(grouped.get(city) ?? []), entry]);
    }
    return [...grouped.entries()]
      .sort(([left], [right]) => {
        if (left === null && right === null) return 0;
        if (left === null) return 1;
        if (right === null) return -1;
        return left.localeCompare(right, 'ru');
      })
      .map(([city, entries]) => ({
        key: city ?? '__legacy__',
        title: city ?? 'Город не указан',
        entries,
      }));
  }, [portfolio.entries]);
  const showGroupTitles = groups.length > 1;
  const totals = portfolio.totals;

  return (
    <Section title="По объектам">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-content-secondary">
        <p>
          Объектов {totals.properties} · сдано {totals.rented} · свободно{' '}
          {totals.vacant}
          {totals.pending > 0 && ` · ожидают арендатора ${totals.pending}`}
        </p>
        {totals.activeRequests > 0 && (
          <span className="rounded-pill border border-warn-line bg-warn-weak px-3 py-1 font-semibold text-warn">
            Заявок в работе {totals.activeRequests}
          </span>
        )}
        {totals.pendingServicesAmount !== 0 && (
          <span className="rounded-pill border border-line bg-surface-icon px-3 py-1 font-semibold text-content">
            Деньги на подходе: {signedMoney(totals.pendingServicesAmount)} ₽
          </span>
        )}
      </div>

      {portfolio.entries.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Объектов пока нет"
          text="Добавьте объект, чтобы он появился в портфельном отчёте."
          action={
            <Link
              href="/properties"
              className="rounded-sm font-semibold text-violet-500 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Перейти к объектам
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.key}>
              {showGroupTitles && (
                <h3 className="border-b border-line bg-sand-200/40 px-4 py-2 text-sm font-semibold text-content-secondary">
                  {group.title}
                </h3>
              )}
              <ul className="divide-y divide-line border-y border-line">
                {group.entries.map((entry) => {
                  const status = PORTFOLIO_STATUS[entry.status];
                  const requests = entry.openRequests + entry.inProgressRequests;
                  return (
                    <li
                      key={entry.propertyId}
                      className="grid gap-4 px-1 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/properties/${entry.propertyId}`}
                            className="break-words font-semibold text-content underline-offset-4 [overflow-wrap:anywhere] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                          >
                            {entry.address}
                          </Link>
                          <StatusPill tone={status.tone}>{status.label}</StatusPill>
                        </div>
                        {entry.status === 'rented' && (
                          <p className="mt-1 break-words text-sm text-content-muted [overflow-wrap:anywhere]">
                            {entry.tenantEmail ?? 'Арендатор не указан'} ·{' '}
                            {entry.monthlyRent === null
                              ? 'аренда не указана'
                              : `${formatMoney(entry.monthlyRent)} ₽/мес`}
                          </p>
                        )}
                      </div>

                      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <dt className="text-content-muted">Доход</dt>
                          <dd className="font-bold text-terracotta-500">
                            {formatMoney(entry.incomeTotal)} ₽
                          </dd>
                        </div>
                        <div>
                          <dt className="text-content-muted">Долг</dt>
                          <dd
                            className={`font-bold ${
                              entry.outstandingTotal > 0 ? 'text-danger' : 'text-content'
                            }`}
                          >
                            {formatMoney(entry.outstandingTotal)} ₽
                          </dd>
                        </div>
                        {requests > 0 && (
                          <div>
                            <dt className="text-content-muted">Заявки</dt>
                            <dd className="font-bold text-warn">{requests}</dd>
                          </div>
                        )}
                        {entry.pendingServicesAmount !== 0 && (
                          <div>
                            <dt className="text-content-muted">На подходе</dt>
                            <dd className="font-bold text-content">
                              {signedMoney(entry.pendingServicesAmount)} ₽
                            </dd>
                          </div>
                        )}
                      </dl>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

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
      <PageHeader
        title="Отчёты"
        subtitle="Портфель объектов, доходы, задолженность и сроки договоров"
      />

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
          <PortfolioSection portfolio={data.portfolio} />

          <StatRow className="mt-8">
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
