'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  Building2,
  ChartNoAxesColumn,
  House,
  LogOut,
  Mail,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { listNotifications } from '@/lib/notifications';
import { listInvitations } from '@/lib/leases';
import { INVITATIONS_CHANGED } from '@/lib/events';
import { usePolling } from '@/lib/usePolling';
import { cn } from './ui/cn';

/**
 * Оболочка приложения: постоянный сайдбар на десктопе (≥1024px) и
 * шапка + нижняя таб-навигация на мобильном.
 *
 * Порог сайдбара — именно 1024px, а не 820px как раньше: на промежуточных
 * ширинах планшета узкий сайдбар отъедал место у таблиц, ради которых
 * десктопная раскладка и делалась.
 *
 * Подписи пунктов оставлены продуктовые («Главная», «Аренда»), хотя в
 * макетах Stitch они названы иначе: тексты интерфейса редизайн не
 * переписывает (ADR-0023).
 */
interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: 'notifications' | 'invitations';
  // Пункт появляется в меню, только пока есть что показывать (ADR-0020).
  onlyWhenBadge?: boolean;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Главная', icon: House },
  { href: '/properties', label: 'Аренда', icon: Building2 },
  {
    href: '/invitations',
    label: 'Приглашения',
    icon: Mail,
    badgeKey: 'invitations',
    onlyWhenBadge: true,
  },
  { href: '/reports', label: 'Отчёты', icon: ChartNoAxesColumn },
  { href: '/notifications', label: 'Уведомления', icon: Bell, badgeKey: 'notifications' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
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
  const items = NAV.filter(
    (n) => !n.onlyWhenBadge || (n.badgeKey && badgeCounts[n.badgeKey] > 0),
  );
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const doLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen bg-app text-content">
      {/* Сайдбар — только десктоп */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col border-r border-line bg-app px-4 py-5 lg:flex">
        <div className="px-2">
          <span className="text-lg font-bold tracking-wide text-content">SOFTRENT</span>
          <p className="mt-0.5 text-xs text-content-muted">Аренда без хлопот</p>
        </div>

        <nav className="mt-8 flex flex-col gap-1">
          {items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              count={item.badgeKey ? badgeCounts[item.badgeKey] : 0}
            />
          ))}
        </nav>

        <div className="mt-auto border-t border-line pt-4">
          <p className="truncate px-2 text-sm text-content-secondary" title={user?.email}>
            {user?.email}
          </p>
          <button
            type="button"
            onClick={doLogout}
            className="mt-2 flex w-full items-center gap-2 rounded-pill px-2 py-2 text-sm text-content-muted transition-colors duration-fast hover:bg-surface-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <LogOut aria-hidden className="size-4" />
            Выйти
          </button>
        </div>
      </aside>

      {/* Шапка — только мобильный */}
      <header className="sticky top-0 z-20 flex h-header items-center justify-between border-b border-line bg-app px-4 lg:hidden">
        <span className="text-base font-bold tracking-wide text-content">SOFTRENT</span>
        <button
          type="button"
          onClick={doLogout}
          aria-label="Выйти"
          className="rounded-pill p-2 text-content-muted transition-colors duration-fast hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <LogOut aria-hidden className="size-5" />
        </button>
      </header>

      <main className="px-screen pb-[calc(var(--bottomnav-h)+24px)] pt-6 lg:ml-sidebar lg:pb-16">
        <div className="mx-auto w-full max-w-content">{children}</div>
      </main>

      {/* Нижняя навигация — только мобильный */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-bottomnav items-stretch border-t border-line bg-app lg:hidden">
        {items.map((item) => {
          const active = isActive(item.href);
          const count = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-1 text-xs',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500',
                active ? 'font-semibold text-violet-500' : 'text-content-muted',
              )}
            >
              <item.icon aria-hidden className="size-5" />
              <span className="max-w-full truncate px-1">{item.label}</span>
              {count > 0 && <NavBadge count={count} className="absolute right-[22%] top-2" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function NavLink({
  item,
  active,
  count,
}: {
  item: NavItem;
  active: boolean;
  count: number;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-3 rounded-pill py-2 pl-3 pr-2 text-base transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
        active
          ? 'font-semibold text-violet-500'
          : 'text-content-secondary hover:bg-surface-hover',
      )}
    >
      {/* Активный пункт помечен и цветом, и полоской: цвет один состояние
          не передаёт. */}
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-pill bg-violet-500"
        />
      )}
      <item.icon aria-hidden className={cn('size-5', !active && 'text-content-muted')} />
      <span className="flex-1 truncate">{item.label}</span>
      {count > 0 && <NavBadge count={count} />}
    </Link>
  );
}

/** Счётчик нейтральный, а не красный: красный в системе означает
 *  просрочку и ошибку, непрочитанные уведомления — не то и не другое. */
function NavBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-pill bg-sand-200 px-1.5 text-xs font-semibold text-ink-700',
        className,
      )}
    >
      {count}
    </span>
  );
}
