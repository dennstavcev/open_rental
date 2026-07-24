'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Icon, List, Row, Section } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listProperties } from '@/lib/properties';
import { listInvitations, listLeases, Lease, STATUS_LABEL } from '@/lib/leases';
import { listNotifications } from '@/lib/notifications';
import { getSummary } from '@/lib/reports';

function DashboardInner() {
  const { user } = useAuth();
  const router = useRouter();
  const [income, setIncome] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [counts, setCounts] = useState({ properties: 0, active: 0, invitations: 0, unread: 0 });
  const [recent, setRecent] = useState<Lease[]>([]);
  const [addr, setAddr] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [props, leases, invs, notes, summary] = await Promise.all([
      listProperties().catch(() => []),
      listLeases().catch(() => []),
      listInvitations().catch(() => []),
      listNotifications().catch(() => []),
      getSummary().catch(() => null),
    ]);
    setAddr(Object.fromEntries(props.map((p) => [p.id, p.address])));
    setCounts({
      properties: props.length,
      active: leases.filter((l) => l.status === 'active').length,
      invitations: invs.length,
      unread: notes.filter((n) => !n.readAt).length,
    });
    setRecent(leases.slice(0, 4));
    if (summary) {
      setIncome(summary.income.total);
      setOutstanding(summary.outstanding.totalDue);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const name = user?.email?.split('@')[0] ?? '';
  const attention =
    counts.invitations > 0 || counts.unread > 0 || outstanding > 0;

  return (
    <>
      <TopBar />
      <div className="container">
        <div className="hero">
          <div className="greeting">Здравствуйте, {name}</div>
          <div className="metrics">
            <div className="metric">
              <div className="v">{income.toLocaleString('ru')} ₽</div>
              <div className="k">Получено всего</div>
            </div>
            <div className="metric">
              <div className="v">{outstanding.toLocaleString('ru')} ₽</div>
              <div className="k">Ожидается к оплате</div>
            </div>
          </div>
        </div>

        <div className="chips">
          <button className="chip" onClick={() => router.push('/onboarding')}>
            <Icon name="plus" /> Сдать объект
          </button>
          <button className="chip" onClick={() => router.push('/properties')}>
            <Icon name="building" /> Объекты
          </button>
          <button className="chip" onClick={() => router.push('/leases')}>
            <Icon name="doc" /> Договоры
          </button>
          <button className="chip" onClick={() => router.push('/reports')}>
            <Icon name="chart" /> Отчёты
          </button>
        </div>

        {attention && (
          <Section title="Требует внимания">
            <List>
              {counts.invitations > 0 && (
                <Row
                  icon="mail"
                  iconVariant="warm"
                  title="Новые приглашения"
                  subtitle="Примите приглашение, чтобы стать арендатором"
                  trail={counts.invitations}
                  href="/invitations"
                />
              )}
              {outstanding > 0 && (
                <Row
                  icon="wallet"
                  iconVariant="warm"
                  title="Ожидают оплаты"
                  subtitle="Счета, по которым ждём оплату"
                  trail={`${outstanding.toLocaleString('ru')} ₽`}
                  href="/reports"
                />
              )}
              {counts.unread > 0 && (
                <Row
                  icon="bell"
                  iconVariant="warm"
                  title="Непрочитанные уведомления"
                  trail={counts.unread}
                  href="/notifications"
                />
              )}
            </List>
          </Section>
        )}

        <Section
          title="Договоры"
          action={
            recent.length > 0 ? (
              <span className="link" onClick={() => router.push('/leases')}>
                Все
              </span>
            ) : undefined
          }
        >
          {loading ? (
            <List>
              <Row title={<span className="skeleton" style={{ display: 'inline-block', width: 160, height: 14 }} />} />
            </List>
          ) : recent.length === 0 ? (
            <EmptyState
              icon="doc"
              title="Пока нет договоров"
              text="Заведите объект и оформите первый договор аренды."
              action={
                <button onClick={() => router.push('/onboarding')}>
                  Начать
                </button>
              }
            />
          ) : (
            <List>
              {recent.map((l) => (
                <Row
                  key={l.id}
                  icon="doc"
                  title={addr[l.propertyId] ?? `Договор ${l.id.slice(0, 8)}`}
                  subtitle={`${l.rentAmount} ₽/мес · с ${l.startDate.slice(0, 10)}`}
                  trail={
                    <span className={`pill ${l.status === 'active' ? 'ok' : ''}`}>
                      {STATUS_LABEL[l.status]}
                    </span>
                  }
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
