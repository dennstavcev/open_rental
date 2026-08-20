'use client';

import { useCallback, useEffect, useState, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { listNotifications } from '@/lib/notifications';
import { listInvitations } from '@/lib/leases';
import { INVITATIONS_CHANGED } from '@/lib/events';
import { usePolling } from '@/lib/usePolling';

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />,
    building: (
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3" />
    ),
    doc: <path d="M7 3h7l4 4v14H7zM14 3v4h4M9 13h6M9 17h6" />,
    chart: <path d="M4 20V4M4 20h16M8 20v-6M13 20V9M18 20v-9" />,
    bell: <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0" />,
    mail: <path d="M3 6h18v12H3zM3 7l9 6 9-6" />,
  };
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badgeKey?: 'notifications' | 'invitations';
  // Пункт появляется в меню, только пока есть что показывать (ADR-0020):
  // приглашение нужно считанные разы за жизнь договора, а место в
  // навигации занимало постоянно.
  onlyWhenBadge?: boolean;
}
const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Главная', icon: 'home' },
  { href: '/properties', label: 'Аренда', icon: 'building' },
  {
    href: '/invitations',
    label: 'Приглашения',
    icon: 'mail',
    badgeKey: 'invitations',
    onlyWhenBadge: true,
  },
  { href: '/reports', label: 'Отчёты', icon: 'chart' },
  { href: '/notifications', label: 'Уведомления', icon: 'bell', badgeKey: 'notifications' },
];

export function TopBar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [pendingInvites, setPendingInvites] = useState(0);

  const refreshUnread = useCallback(() => {
    if (!user) return;
    listNotifications()
      .then((n) => setUnread(n.filter((x) => !x.readAt).length))
      .catch(() => setUnread(0));
  }, [user]);

  const refreshInvites = useCallback(() => {
    if (!user) return;
    listInvitations()
      .then((items) => setPendingInvites(items.length))
      .catch(() => setPendingInvites(0));
  }, [user]);

  useEffect(() => {
    refreshUnread();
    refreshInvites();
  }, [refreshUnread, refreshInvites, pathname]);

  // Своё действие («Принять»/«Отклонить») отражается сразу, не дожидаясь
  // следующего опроса — иначе пункт меню ведёт на пустой экран.
  useEffect(() => {
    window.addEventListener(INVITATIONS_CHANGED, refreshInvites);
    return () => window.removeEventListener(INVITATIONS_CHANGED, refreshInvites);
  }, [refreshInvites]);
  usePolling(refreshUnread, 30000);
  usePolling(refreshInvites, 30000);

  const badgeCounts = { notifications: unread, invitations: pendingInvites };

  // Скрытый пункт остаётся доступным по прямой ссылке — экран не удалён,
  // главный путь к нему теперь карточка «Примите приглашение» в «Сегодня».
  const items = NAV.filter(
    (n) => !n.onlyWhenBadge || (n.badgeKey && badgeCounts[n.badgeKey] > 0),
  );

  const active = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  const doLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="brand">SOFTRENT</div>
        {items.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`nav-item ${active(n.href) ? 'active' : ''}`}
          >
            <Icon name={n.icon} />
            <span>{n.label}</span>
            {n.badgeKey && badgeCounts[n.badgeKey] > 0 && (
              <span className="pill" style={{ marginLeft: 'auto' }}>
                {badgeCounts[n.badgeKey]}
              </span>
            )}
          </Link>
        ))}
        <div className="spacer" />
        <div className="user">{user?.email}</div>
        <button className="secondary" onClick={doLogout}>
          Выйти
        </button>
      </aside>

      {/* Mobile top header */}
      <header className="mobile-header">
        <span className="brand">SOFTRENT</span>
        <button className="secondary" onClick={doLogout} style={{ padding: '6px 12px' }}>
          Выйти
        </button>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="bottom-nav">
        {items.map((n) => (
          <Link key={n.href} href={n.href} className={active(n.href) ? 'active' : ''}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
            {n.badgeKey && badgeCounts[n.badgeKey] > 0 && (
              <span className="nav-badge">{badgeCounts[n.badgeKey]}</span>
            )}
          </Link>
        ))}
      </nav>
    </>
  );
}
