'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { LeaseTabs, List, PageHeader, Row, Section } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { getProperty } from '@/lib/properties';
import {
  generateDocument,
  getDocument,
  getLease,
  Lease,
  LeaseSignedScan,
  listSignedScans,
  sendLease,
  STATUS_LABEL,
  uploadSignedScan,
} from '@/lib/leases';
import { formatMoney } from '@/lib/format';
import { usePolling } from '@/lib/usePolling';

const ROLE_LABEL = { landlord: 'Собственник', tenant: 'Арендатор' };

function LeaseDetailInner() {
  const { id } = useParams<{ id: string }>();
  const [lease, setLease] = useState<Lease | null>(null);
  const [address, setAddress] = useState<string>('');
  const [scans, setScans] = useState<LeaseSignedScan[]>([]);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [showDoc, setShowDoc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const l = await getLease(id);
      setLease(l);
      getProperty(l.propertyId).then((p) => setAddress(p.address)).catch(() => {});
      if (l.status === 'sent' || l.status === 'active') {
        setScans(await listSignedScans(id));
      }
      try {
        setDocHtml((await getDocument(id)).content);
      } catch {
        setDocHtml(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  usePolling(load, 30000);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendLease(id, email);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка отправки');
    } finally {
      setBusy(false);
    }
  }

  async function onGenerate() {
    setBusy(true);
    setError(null);
    try {
      setDocHtml((await generateDocument(id)).content);
      setShowDoc(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка генерации');
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadSignedScan(id, file);
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки скана');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        {error && <div className="error">{error}</div>}
        {!lease ? (
          error ? null : <p className="muted">Загрузка…</p>
        ) : (
          <>
            <PageHeader
              back="/properties"
              title={address || 'Договор'}
              action={
                <span className={`pill ${lease.status === 'active' ? 'ok' : ''}`}>
                  {STATUS_LABEL[lease.status]}
                </span>
              }
            />

            {lease.status === 'active' && lease.tenantId && <LeaseTabs id={id} />}

            <div style={{ textAlign: 'right', margin: '-4px 0 8px' }}>
              <a href={`/properties/${lease.propertyId}`} className="muted">
                Объект →
              </a>
            </div>

            <div className="card">
              <div className="facts">
                <div className="fact"><div className="k">АРЕНДА</div><div className="v">{formatMoney(lease.rentAmount)} ₽/мес</div></div>
                <div className="fact"><div className="k">ДЕПОЗИТ</div><div className="v">{formatMoney(lease.depositAmount)} ₽</div></div>
                <div className="fact"><div className="k">ДЕНЬ ОПЛАТЫ</div><div className="v">{lease.paymentDay} числа</div></div>
                <div className="fact"><div className="k">ПЕНЯ</div><div className="v">{lease.penaltyRatePercentPerDay}%/день</div></div>
                <div className="fact"><div className="k">СРОК</div><div className="v">{lease.startDate.slice(0, 10)} — {lease.endDate.slice(0, 10)}</div></div>
              </div>
            </div>

            {lease.status === 'active' && lease.tenantId && (
              <div style={{ textAlign: 'right', margin: '-4px 0 8px' }}>
                <a href={`/leases/${id}/termination`} className="muted">
                  Расторжение договора →
                </a>
              </div>
            )}

            <Section
              title="Текст договора"
              action={
                <button className="link" onClick={onGenerate} disabled={busy}>
                  {docHtml ? 'Перегенерировать' : 'Сгенерировать'}
                </button>
              }
            >
              {docHtml ? (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <button
                    className="row"
                    onClick={() => setShowDoc((v) => !v)}
                    style={{ borderBottom: showDoc ? '1px solid var(--border-default)' : 'none' }}
                  >
                    <span className="lead"><span style={{ fontSize: 18 }}>📄</span></span>
                    <span className="body"><span className="t">Договор аренды</span><span className="s">{showDoc ? 'Скрыть' : 'Показать текст'}</span></span>
                  </button>
                  {showDoc && (
                    <iframe
                      title="Договор"
                      srcDoc={docHtml}
                      style={{ width: '100%', height: 460, border: 'none', background: '#fff' }}
                    />
                  )}
                </div>
              ) : (
                <div className="empty">Текст ещё не сгенерирован.</div>
              )}
            </Section>

            {lease.status === 'draft' && (
              <Section title="Отправить арендатору">
                <form className="card" onSubmit={onSend}>
                  <div className="field">
                    <label>Email арендатора</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tenant@mail.ru" required />
                  </div>
                  <button type="submit" disabled={busy} style={{ width: '100%' }}>
                    {busy ? 'Отправка…' : 'Отправить приглашение'}
                  </button>
                </form>
              </Section>
            )}

            {(lease.status === 'sent' || lease.status === 'active') && (
              <Section title="Подписанные сканы">
                <div className="hint">
                  Распечатайте текст, подпишите обеими сторонами и загрузите сканы.
                  Договор активируется автоматически, когда сканы загрузят оба.
                </div>
                <List>
                  {(['landlord', 'tenant'] as const).map((role) => {
                    const scan = scans.find((s) => s.role === role);
                    return (
                      <Row
                        key={role}
                        icon={scan ? 'check' : 'clock'}
                        iconVariant={scan ? undefined : 'warm'}
                        title={ROLE_LABEL[role]}
                        subtitle={scan ? `Загружен ${scan.confirmedAt.slice(0, 10)}` : 'Ожидается скан'}
                        chevron={false}
                      />
                    );
                  })}
                </List>
                {lease.status === 'sent' && (
                  <form onSubmit={onUpload} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ flex: 1 }} />
                    <button type="submit" disabled={busy}>{busy ? 'Загрузка…' : 'Загрузить скан'}</button>
                  </form>
                )}
                {lease.status === 'active' && (
                  <p className="pill ok" style={{ padding: '6px 12px' }}>Договор заключён и действует</p>
                )}
              </Section>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function LeaseDetailPage() {
  return (
    <RequireAuth>
      <LeaseDetailInner />
    </RequireAuth>
  );
}
