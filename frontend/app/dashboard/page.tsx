'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { listProperties } from '@/lib/properties';
import { listInvitations, listLeases, Lease, STATUS_LABEL } from '@/lib/leases';
import { listNotifications } from '@/lib/notifications';

function DashboardInner() {
  const [stats, setStats] = useState({
    properties: 0,
    leases: 0,
    active: 0,
    invitations: 0,
    unread: 0,
  });
  const [recent, setRecent] = useState<Lease[]>([]);

  const load = useCallback(async () => {
    const [props, leases, invs, notes] = await Promise.all([
      listProperties().catch(() => []),
      listLeases().catch(() => []),
      listInvitations().catch(() => []),
      listNotifications().catch(() => []),
    ]);
    setStats({
      properties: props.length,
      leases: leases.length,
      active: leases.filter((l) => l.status === 'active').length,
      invitations: invs.length,
      unread: notes.filter((n) => !n.readAt).length,
    });
    setRecent(leases.slice(0, 5));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <TopBar />
      <div className="container">
        <h1>Обзор</h1>

        <div className="stat-grid">
          <Link href="/properties" className="stat">
            <div className="num">{stats.properties}</div>
            <div className="label">Объекты</div>
          </Link>
          <Link href="/leases" className="stat">
            <div className="num">{stats.active}</div>
            <div className="label">Действующие договоры</div>
          </Link>
          <Link href="/leases" className="stat">
            <div className="num">{stats.leases}</div>
            <div className="label">Всего договоров</div>
          </Link>
          <Link href="/invitations" className="stat">
            <div className="num">{stats.invitations}</div>
            <div className="label">Приглашения</div>
          </Link>
          <Link href="/notifications" className="stat">
            <div className="num">{stats.unread}</div>
            <div className="label">Непрочитанные</div>
          </Link>
        </div>

        <h2>Быстрые действия</h2>
        <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/onboarding">
            <button>Мастер настройки</button>
          </Link>
          <Link href="/properties">
            <button className="secondary">Добавить объект</button>
          </Link>
          <Link href="/reports">
            <button className="secondary">Отчёты</button>
          </Link>
        </div>

        <h2>Последние договоры</h2>
        {recent.length === 0 ? (
          <p className="muted">Договоров пока нет.</p>
        ) : (
          recent.map((l) => (
            <Link key={l.id} href={`/leases/${l.id}`} className="card link" style={{ display: 'block' }}>
              <strong>Договор {l.id.slice(0, 8)}</strong>{' '}
              <span className={`pill ${l.status === 'active' ? 'ok' : ''}`}>
                {STATUS_LABEL[l.status]}
              </span>
              <div className="muted">
                аренда {l.rentAmount} ₽/мес · с {l.startDate.slice(0, 10)} по{' '}
                {l.endDate.slice(0, 10)}
              </div>
            </Link>
          ))
        )}
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
