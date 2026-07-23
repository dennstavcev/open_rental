'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { listNotifications } from '@/lib/notifications';

const NAV = [
  { href: '/dashboard', label: 'Дашборд' },
  { href: '/properties', label: 'Объекты' },
  { href: '/leases', label: 'Договоры' },
  { href: '/invitations', label: 'Приглашения' },
  { href: '/reports', label: 'Отчёты' },
];

export function TopBar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    listNotifications()
      .then((n) => setUnread(n.filter((x) => !x.readAt).length))
      .catch(() => setUnread(0));
  }, [user, pathname]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <header className="appbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, minWidth: 0 }}>
        <Link href="/dashboard" className="brand">
          OPENRENT
        </Link>
        <nav className="appnav">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={isActive(n.href) ? 'active' : ''}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="right">
        <Link
          href="/notifications"
          className={isActive('/notifications') ? 'active' : ''}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          Уведомления
          {unread > 0 && <span className="badge">{unread}</span>}
        </Link>
        <span className="muted" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user?.email}
        </span>
        <button
          className="secondary"
          onClick={() => {
            logout();
            router.replace('/login');
          }}
        >
          Выйти
        </button>
      </div>
    </header>
  );
}
