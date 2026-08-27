'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  Building2,
  ChartNoAxesColumn,
  Check,
  FileText,
  Gauge,
  Info,
  Mail,
  MessageSquare,
  Plus,
  Wallet,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { RequireAuth } from '@/components/RequireAuth';
import { EmptyState } from '@/components/EmptyState';
import { LeaseStatusPill } from '@/components/LeaseStatusPill';
import { List, Row } from '@/components/List';
import { PageHeader } from '@/components/PageHeader';
import { Section } from '@/components/Section';
import { Stat, StatRow } from '@/components/Stat';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { listProperties } from '@/lib/properties';
import { listInvitations, listLeases, listSignedScans, Lease } from '@/lib/leases';
import { listBills } from '@/lib/billing';
import { listNotifications } from '@/lib/notifications';
import { getSummary } from '@/lib/reports';
import { formatMoney } from '@/lib/format';
import { getPartyInfoStatus } from '@/lib/party-info';
import { listMetersForLease } from '@/lib/catalog';

interface Action {
  key: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  href: string;
}

function DashboardInner() {
  const { user } = useAuth();
  const [income, setIncome] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [recent, setRecent] = useState<Lease[]>([]);
  const [addr, setAddr] = useState<Record<string, string>>({});
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const uid = user?.id;
    const [props, leases, invs, notes, summary] = await Promise.all([
      listProperties().catch(() => []),
      listLeases().catch(() => []),
      listInvitations().catch(() => []),
      listNotifications().catch(() => []),
      getSummary().catch(() => null),
    ]);
    // Адрес приходит вместе с договором (ADR-0020): у арендатора своих
    // объектов нет, и listProperties() для него пуст — раньше подпись
    // действия превращалась в безликое «Договор».
    const addrMap = Object.fromEntries([
      ...props.map((p) => [p.id, p.address] as const),
      ...leases.map((l) => [l.propertyId, l.property.address] as const),
    ]);
    setAddr(addrMap);
    setRecent(leases.slice(0, 4));
    if (summary) {
      setIncome(summary.income.total);
      setOutstanding(summary.outstanding.totalDue);
    }

    const acts: Action[] = invs.map((inv) => ({
      key: `inv-${inv.id}`,
      icon: Mail,
      title: 'Примите приглашение',
      subtitle: `${inv.property.address} · ${inv.landlord.fullName}`,
      href: '/invitations',
    }));
    const unreadGeneral = notes.filter(
      (note) => !note.readAt && note.type !== 'message_new',
    ).length;
    if (unreadGeneral > 0) {
      acts.push({
        key: 'notes',
        icon: Bell,
        title: `${unreadGeneral} непрочитанных уведомлений`,
        subtitle: 'Посмотреть события',
        href: '/notifications',
      });
    }

    // Конкретный следующий шаг по каждому договору
    await Promise.all(
      leases.map(async (l) => {
        const role = l.tenantId === uid ? 'tenant' : 'landlord';
        const place = addrMap[l.propertyId] ?? l.property.address;
        if (
          notes.some(
            (note) =>
              !note.readAt &&
              note.leaseId === l.id &&
              note.type === 'message_new',
          )
        ) {
          acts.push({
            key: `chat-${l.id}`,
            icon: MessageSquare,
            title: 'Новое сообщение в чате',
            subtitle: place,
            href: `/leases/${l.id}/chat`,
          });
        }
        if (l.status === 'sent' || l.status === 'active') {
          const partyInfo = await getPartyInfoStatus(l.id).catch(() => null);
          if (partyInfo && (!partyInfo.self.filled || partyInfo.self.needsConsent)) {
            acts.push({
              key: `pii-${l.id}`,
              icon: Info,
              title: 'Внесите паспортные данные',
              subtitle: place,
              href: `/leases/${l.id}/party-info`,
            });
          }
        }
        if (l.status === 'sent') {
          const scans = await listSignedScans(l.id).catch(() => []);
          if (!scans.find((s) => s.role === role)) {
            acts.push({
              key: `sign-${l.id}`,
              icon: FileText,
              title: 'Подпишите договор',
              subtitle: place,
              href: `/leases/${l.id}`,
            });
          }
        } else if (l.status === 'active') {
          const bills = await listBills(l.id).catch(() => []);
          const meterView = await listMetersForLease(l.id).catch(() => null);
          const readingsOverdue =
            meterView?.meters.some((meter) => meter.readingsStatus === 'overdue') ??
            false;
          const readingsDueSoon =
            (meterView?.readingsDaysLeft ?? Number.POSITIVE_INFINITY) <= 3 &&
            (meterView?.meters.some((meter) => meter.readingsStatus === 'due') ??
              false);
          if (
            (role === 'tenant' && (readingsOverdue || readingsDueSoon)) ||
            (role === 'landlord' && readingsOverdue)
          ) {
            acts.push({
              key: `readings-${l.id}`,
              icon: Gauge,
              title:
                role === 'landlord'
                  ? 'Арендатор не подал показания'
                  : readingsOverdue
                    ? 'Показания просрочены'
                    : 'Подайте показания',
              subtitle: place,
              href: `/leases/${l.id}/meters`,
            });
          }
          const fin = bills.find(
            (b) => b.bill.stage === 'final' && b.bill.paymentStatus !== 'paid',
          );
          if (fin) {
            if (role === 'tenant' && fin.bill.paymentStatus === 'pending') {
              acts.push({
                key: `pay-${l.id}`,
                icon: Wallet,
                title: `Оплатите ${formatMoney(fin.totalDue)} ₽`,
                subtitle: place,
                href: `/leases/${l.id}/bills`,
              });
            }
            if (role === 'landlord' && fin.bill.paymentStatus === 'payment_claimed') {
              acts.push({
                key: `confirm-${l.id}`,
                icon: Wallet,
                title: 'Подтвердите оплату',
                subtitle: place,
                href: `/leases/${l.id}/bills`,
              });
            }
          }
        }
      }),
    );

    setActions(acts);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const name = user?.email?.split('@')[0] ?? '';
  // Без хвостового «г.» — в интерфейсе он лишний шум.
  const today = new Date()
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/\s*г\.$/, '');

  return (
    <AppShell>
      <PageHeader title={`Здравствуйте, ${name}`} subtitle={today} />

      {/* Деньги — самое заметное на экране: это бытовой финансовый
          инструмент, а не витрина. */}
      <StatRow>
        <Stat label="Получено всего" value={`${formatMoney(income)} ₽`} tone="money" />
        <Stat label="Ожидается к оплате" value={`${formatMoney(outstanding)} ₽`} />
      </StatRow>

      <Section title="Сегодня">
        {loading ? (
          <List>
            {[0, 1].map((i) => (
              <Row
                key={i}
                title={<Skeleton className="h-4 w-48" />}
                subtitle={<Skeleton className="mt-1 h-3 w-32" />}
              />
            ))}
          </List>
        ) : actions.length === 0 ? (
          <div className="flex items-center gap-4 rounded-md border border-line px-5 py-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-success-weak text-success">
              <Check aria-hidden className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-content">Всё под контролем</p>
              <p className="text-sm text-content-muted">
                Нет действий, требующих вашего внимания.
              </p>
            </div>
          </div>
        ) : (
          <List>
            {actions.map((a) => (
              <Row
                key={a.key}
                icon={a.icon}
                title={a.title}
                subtitle={a.subtitle}
                href={a.href}
              />
            ))}
          </List>
        )}
      </Section>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild variant="secondary" size="sm">
          <Link href="/onboarding">
            <Plus aria-hidden /> Сдать объект
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href="/properties">
            <Building2 aria-hidden /> Аренда
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href="/reports">
            <ChartNoAxesColumn aria-hidden /> Отчёты
          </Link>
        </Button>
      </div>

      <Section
        title="Договоры"
        action={
          recent.length > 0 ? (
            <Button asChild variant="link" size="sm">
              <Link href="/properties">Все</Link>
            </Button>
          ) : undefined
        }
      >
        {loading ? null : recent.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Пока нет договоров"
            text="Заведите объект и оформите первый договор аренды."
            action={
              <Button asChild>
                <Link href="/onboarding">Начать</Link>
              </Button>
            }
          />
        ) : (
          <List>
            {recent.map((l) => (
              <Row
                key={l.id}
                icon={FileText}
                title={addr[l.propertyId] ?? l.property.address}
                subtitle={`${formatMoney(l.rentAmount)} ₽/мес · с ${l.startDate.slice(0, 10)}`}
                value={<LeaseStatusPill status={l.status} />}
                href={`/leases/${l.id}`}
              />
            ))}
          </List>
        )}
      </Section>
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardInner />
    </RequireAuth>
  );
}
