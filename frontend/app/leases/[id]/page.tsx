'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { ApiError } from '@/lib/api';
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

const ROLE_LABEL = { landlord: 'Собственник', tenant: 'Арендатор' };

function LeaseDetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [lease, setLease] = useState<Lease | null>(null);
  const [scans, setScans] = useState<LeaseSignedScan[]>([]);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const l = await getLease(id);
      setLease(l);
      if (l.status === 'sent' || l.status === 'active') {
        setScans(await listSignedScans(id));
      }
      try {
        setDocHtml((await getDocument(id)).content);
      } catch {
        setDocHtml(null); // ещё не сгенерирован
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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
      const res = await uploadSignedScan(id, file);
      if (fileRef.current) fileRef.current.value = '';
      await load();
      if (res.activated) setError(null);
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
        <h1>Договор</h1>
        {error && <div className="error">{error}</div>}
        {!lease ? (
          <p className="muted">Загрузка…</p>
        ) : (
          <>
            <div className="card">
              <div>
                <strong>Статус:</strong> {STATUS_LABEL[lease.status]}
              </div>
              <div className="muted">
                Аренда {lease.rentAmount} ₽/мес · задаток {lease.depositAmount} ₽
                · день оплаты {lease.paymentDay} · пеня{' '}
                {lease.penaltyRatePercentPerDay}%/день
              </div>
              <div className="muted">
                Срок: {lease.startDate.slice(0, 10)} —{' '}
                {lease.endDate.slice(0, 10)}
              </div>
              {lease.status === 'active' && (
                <div style={{ marginTop: 8 }}>
                  <Link href={`/leases/${lease.id}/bills`}>Счета и платежи →</Link>
                </div>
              )}
              {(lease.status === 'sent' || lease.status === 'active') &&
                lease.tenantId && (
                  <div
                    style={{
                      marginTop: 8,
                      display: 'flex',
                      gap: 16,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Link href={`/leases/${lease.id}/chat`}>Чат →</Link>
                    <Link href={`/leases/${lease.id}/requests`}>Заявки →</Link>
                    <Link href={`/leases/${lease.id}/tenant-info`}>
                      Паспортные данные →
                    </Link>
                    {lease.status === 'active' && (
                      <Link href={`/leases/${lease.id}/termination`}>
                        Расторжение →
                      </Link>
                    )}
                  </div>
                )}
            </div>

            <div className="card">
              <h3>Текст договора</h3>
              <button
                className="secondary"
                onClick={onGenerate}
                disabled={busy}
              >
                {docHtml ? 'Перегенерировать' : 'Сгенерировать'}
              </button>
              {docHtml && (
                <iframe
                  title="Договор"
                  srcDoc={docHtml}
                  style={{
                    width: '100%',
                    height: 420,
                    marginTop: 12,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: '#fff',
                  }}
                />
              )}
            </div>

            {lease.status === 'draft' && (
              <form className="card" onSubmit={onSend}>
                <h3>Отправить арендатору</h3>
                <div className="field">
                  <label>Email арендатора</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" disabled={busy}>
                  {busy ? 'Отправка…' : 'Отправить приглашение'}
                </button>
              </form>
            )}

            {(lease.status === 'sent' || lease.status === 'active') && (
              <div className="card">
                <h3>Подписанные сканы</h3>
                <p className="muted">
                  Распечатайте текст, подпишите обеими сторонами и загрузите
                  сканы. Договор активируется автоматически, когда сканы
                  загрузят оба.
                </p>
                {scans.length === 0 ? (
                  <p className="muted">Сканов пока нет.</p>
                ) : (
                  scans.map((s) => (
                    <div key={s.id} className="muted">
                      ✓ {ROLE_LABEL[s.role]} — загружен{' '}
                      {s.confirmedAt.slice(0, 10)}
                    </div>
                  ))
                )}
                {lease.status === 'sent' && (
                  <form onSubmit={onUpload} style={{ marginTop: 12 }}>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                    />
                    <button type="submit" disabled={busy} style={{ marginLeft: 8 }}>
                      {busy ? 'Загрузка…' : 'Загрузить свой скан'}
                    </button>
                  </form>
                )}
                {lease.status === 'active' && (
                  <p style={{ color: 'green' }}>Договор заключён и действует.</p>
                )}
              </div>
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
