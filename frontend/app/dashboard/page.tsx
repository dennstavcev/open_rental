'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Icon, List, Row, Section } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listProperties } from '@/lib/properties';
import {
  listInvitations,
  listLeases,
  listSignedScans,
  Lease,
  STATUS_LABEL,
} from '@/lib/leases';
import { listBills } from '@/lib/billing';
import { listNotifications } from '@/lib/notifications';
import { getSummary } from '@/lib/reports';
import { formatMoney } from '@/lib/format';

interface Action {
  key: string;
  icon: string;
  title: string;
  subtitle: string;
  href: string;
}

function DashboardInner() {
  const { user } = useAuth();
  const router = useRouter();
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
    const addrMap = Object.fromEntries(props.map((p) => [p.id, p.address]));
    setAddr(addrMap);
    setRecent(leases.slice(0, 4));
    if (summary) {
      setIncome(summary.income.total);
      setOutstanding(summary.outstanding.totalDue);
    }

    const acts: Action[] = invs.map((inv) => ({
      key: `inv-${inv.id}`,
      icon: 'mail',
      title: 'Примите приглашение',
      subtitle: 'Станьте арендатором по договору',
      href: '/invitations',
    }));
    if (notes.some((n) => !n.readAt)) {
      const n = notes.filter((x) => !x.readAt).length;
      acts.push({
        key: 'notes',
        icon: 'bell',
        title: `${n} непрочитанных уведомлений`,
        subtitle: 'Посмотреть события',
        href: '/notifications',
      });
    }

    // Конкретный следующий шаг по каждому договору
    await Promise.all(
      leases.map(async (l) => {
        const role = l.tenantId === uid ? 'tenant' : 'landlord';
        const place = addrMap[l.propertyId] ?? 'Договор';
        if (l.status === 'sent') {
          const scans = await listSignedScans(l.id).catch(() => []);
          if (!scans.find((s) => s.role === role)) {
            acts.push({
              key: `sign-${l.id}`,
              icon: 'doc',
              title: 'Подпишите договор',
              subtitle: place,
              href: `/leases/${l.id}`,
            });
          }
        } else if (l.status === 'active') {
          const bills = await listBills(l.id).catch(() => []);
          const fin = bills.find((b) => b.bill.stage === 'final' && b.bill.paymentStatus !== 'paid');
          if (fin) {
            if (role === 'tenant' && fin.bill.paymentStatus === 'pending') {
              acts.push({
                key: `pay-${l.id}`,
                icon: 'wallet',
                title: `Оплатите ${formatMoney(fin.totalDue)} ₽`,
                subtitle: place,
                href: `/leases/${l.id}/bills`,
              });
            }
            if (role === 'landlord' && fin.bill.paymentStatus === 'payment_claimed') {
              acts.push({
                key: `confirm-${l.id}`,
                icon: 'wallet',
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

  return (
    <>
      <TopBar />
      <div className="container">
        <div className="hero">
          <div className="greeting">Здравствуйте, {name}</div>
          <div className="metrics">
            <div className="metric">
              <div className="v">{formatMoney(income)} ₽</div>
              <div className="k">Получено всего</div>
            </div>
            <div className="metric">
              <div className="v">{formatMoney(outstanding)} ₽</div>
              <div className="k">Ожидается к оплате</div>
            </div>
          </div>
        </div>

        <Section title="Сегодня">
          {loading ? (
            <List>
              <Row title={<span className="skeleton" style={{ display: 'inline-block', width: 200, height: 14 }} />} chevron={false} />
            </List>
          ) : actions.length === 0 ? (
            <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="lead"><Icon name="check" /></span>
              <div>
                <div style={{ fontWeight: 'var(--weight-semibold)' }}>Всё под контролем</div>
                <div className="muted">Нет действий, требующих вашего внимания.</div>
              </div>
            </div>
          ) : (
            <List>
              {actions.map((a) => (
                <Row key={a.key} icon={a.icon} iconVariant="warm" title={a.title} subtitle={a.subtitle} href={a.href} />
              ))}
            </List>
          )}
        </Section>

        <div className="chips">
          <button className="chip" onClick={() => router.push('/onboarding')}>
            <Icon name="plus" /> Сдать объект
          </button>
          <button className="chip" onClick={() => router.push('/properties')}>
            <Icon name="building" /> Аренда
          </button>
          <button className="chip" onClick={() => router.push('/reports')}>
            <Icon name="chart" /> Отчёты
          </button>
        </div>

        <Section
          title="Договоры"
          action={recent.length > 0 ? <span className="link" onClick={() => router.push('/properties')}>Все</span> : undefined}
        >
          {loading ? null : recent.length === 0 ? (
            <EmptyState
              icon="doc"
              title="Пока нет договоров"
              text="Заведите объект и оформите первый договор аренды."
              action={<button onClick={() => router.push('/onboarding')}>Начать</button>}
            />
          ) : (
            <List>
              {recent.map((l) => (
                <Row
                  key={l.id}
                  icon="doc"
                  title={addr[l.propertyId] ?? `Договор ${l.id.slice(0, 8)}`}
                  subtitle={`${formatMoney(l.rentAmount)} ₽/мес · с ${l.startDate.slice(0, 10)}`}
                  trail={<span className={`pill ${l.status === 'active' ? 'ok' : ''}`}>{STATUS_LABEL[l.status]}</span>}
                  href={`/leases/${l.id}`}
                />
              ))}
            </List>
          )}
        </Section>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardInner />
    </RequireAuth>
  );
}
