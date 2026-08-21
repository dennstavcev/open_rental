'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from './ui/cn';

/**
 * Навигация внутри договора. Это ссылки на отдельные маршруты, а не
 * радиксовые табы: каждая вкладка — свой экран со своим URL.
 */
export function LeaseTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/leases/${id}`;
  const tabs = [
    { href: base, label: 'Договор' },
    { href: `${base}/bills`, label: 'Счета' },
    { href: `${base}/meters`, label: 'Показания' },
    { href: `${base}/requests`, label: 'Заявки' },
    { href: `${base}/chat`, label: 'Чат' },
  ];

  return (
    <nav className="mb-6 flex gap-6 overflow-x-auto border-b border-line">
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
          </Link>
        );
      })}
    </nav>
  );
}
