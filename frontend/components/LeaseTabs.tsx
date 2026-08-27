'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NOTIFICATIONS_CHANGED } from '@/lib/events';
import { listNotifications } from '@/lib/notifications';
import { StatusPill } from './StatusPill';
import { cn } from './ui/cn';

/**
 * Навигация внутри договора. Это ссылки на отдельные маршруты, а не
 * радиксовые табы: каждая вкладка — свой экран со своим URL.
 */
export function LeaseTabs({ id, archived = false }: { id: string; archived?: boolean }) {
  const pathname = usePathname();
  const base = `/leases/${id}`;
  const chatHref = `${base}/chat`;
  const [unreadChat, setUnreadChat] = useState(false);
  const refresh = useCallback(async () => {
    const notes = await listNotifications().catch(() => []);
    setUnreadChat(
      notes.some(
        (note) =>
          !note.readAt && note.leaseId === id && note.type === 'message_new',
      ),
    );
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
  }, [refresh]);

  const tabs = [
    { href: base, label: 'Договор' },
    { href: `${base}/bills`, label: 'Счета' },
    { href: `${base}/meters`, label: 'Показания' },
    { href: `${base}/requests`, label: 'Заявки' },
    { href: chatHref, label: 'Чат' },
  ];

  return (
    <div className="mb-6">
      {archived && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-icon px-4 py-3">
          <StatusPill tone="neutral">Архив</StatusPill>
          <p className="text-sm text-content-muted">
            Договор завершён. Новые показания и заявки добавить нельзя; счета, переписка и вся
            история открыты.
          </p>
        </div>
      )}
      <nav className="flex gap-6 overflow-x-auto border-b border-line">
        {tabs.map((tab) => {
          // Точное сравнение, иначе вкладка «Договор» подсвечивалась бы
          // на каждой вложенной вкладке.
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px whitespace-nowrap border-b-2 px-1 pb-3 text-base transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                active
                  ? 'border-violet-500 font-semibold text-violet-500'
                  : 'border-transparent text-content-muted hover:text-content',
              )}
            >
              {tab.label}
              {tab.href === chatHref && unreadChat && pathname !== chatHref && (
                <>
                  <span
                    aria-hidden
                    className="ml-2 inline-block size-2 rounded-full bg-violet-500 align-middle"
                  />
                  <span className="sr-only">есть новые сообщения</span>
                </>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
