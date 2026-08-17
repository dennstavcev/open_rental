'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

// ---- Icons (inline SVG, no deps) ----
const PATHS: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />,
  building: (
    <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3" />
  ),
  doc: <path d="M7 3h7l4 4v14H7zM14 3v4h4M9 13h6M9 17h6" />,
  chart: <path d="M4 20V4M4 20h16M8 20v-6M13 20V9M18 20v-9" />,
  bell: <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0" />,
  mail: <path d="M3 6h18v12H3zM3 7l9 6 9-6" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  back: <path d="m15 18-6-6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  wallet: <path d="M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 7h16a1 1 0 0 1 1 1v3m0 0h-4a2 2 0 0 0 0 4h4" />,
  chat: <path d="M4 5h16v11H9l-4 4V16H4z" />,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5l-5 5 2.4 2.4 5-5a4 4 0 0 0 5-5.4l-2.6 2.6-2-2z" />,
  gauge: <path d="M12 13V8M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 13l3-2" />,
  key: <path d="M15 7a4 4 0 1 0-3.9 5L13 14l2 2 2-2 2 2 1.5-1.5L15 8.9A4 4 0 0 0 15 7z" />,
  check: <path d="m5 13 4 4L19 7" />,
  clock: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v4l3 2" />,
  inbox: <path d="M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
};

export function Icon({ name }: { name: string }) {
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
      {PATHS[name] ?? PATHS.doc}
    </svg>
  );
}

// ---- Page header ----
export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  back?: boolean | string;
}) {
  const router = useRouter();
  return (
    <div className="page-head">
      <div className="titles" style={{ minWidth: 0 }}>
        {back && (
          <button
            className="back-btn"
            onClick={() =>
              typeof back === 'string' ? router.push(back) : router.back()
            }
            aria-label="Назад"
          >
            <Icon name="back" />
          </button>
        )}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div className="actions">{action}</div>}
    </div>
  );
}

// ---- Section header ----
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </>
  );
}

// ---- List + Row ----
export function List({ children }: { children: ReactNode }) {
  return <div className="list">{children}</div>;
}

export function Row({
  icon,
  iconVariant,
  title,
  subtitle,
  trail,
  onClick,
  href,
  chevron = true,
}: {
  icon?: string;
  iconVariant?: 'warm';
  title: ReactNode;
  subtitle?: ReactNode;
  trail?: ReactNode;
  onClick?: () => void;
  href?: string;
  chevron?: boolean;
}) {
  const router = useRouter();
  const handle = onClick ?? (href ? () => router.push(href) : undefined);
  return (
    <button className="row" onClick={handle} disabled={!handle}>
      {icon && (
        <span className={`lead ${iconVariant ?? ''}`}>
          <Icon name={icon} />
        </span>
      )}
      <span className="body">
        <span className="t">{title}</span>
        {subtitle && <span className="s">{subtitle}</span>}
      </span>
      {trail && <span className="trail">{trail}</span>}
      {(handle || href) && chevron && <Icon name="chevron" />}
    </button>
  );
}

// ---- FAB ----
export function Fab({
  onClick,
  label = 'Добавить',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button className="fab" onClick={onClick} aria-label={label}>
      +
    </button>
  );
}

// ---- Empty state ----
export function EmptyState({
  icon = 'inbox',
  title,
  text,
  action,
}: {
  icon?: string;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="ico">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

// ---- Segmented control ----
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Lease hub tabs ----
export function LeaseTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/leases/${id}`, label: 'Обзор', exact: true },
    { href: `/leases/${id}/bills`, label: 'Счета' },
    { href: `/leases/${id}/chat`, label: 'Чат' },
    { href: `/leases/${id}/requests`, label: 'Заявки' },
  ];
  const isActive = (t: { href: string; exact?: boolean }) =>
    t.exact ? pathname === t.href : pathname.startsWith(t.href);
  return (
    <div className="lease-tabs">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={isActive(t) ? 'active' : ''}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

// ---- Bottom sheet / modal ----
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="sheet-close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
