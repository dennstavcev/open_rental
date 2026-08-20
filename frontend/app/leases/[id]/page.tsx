'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { InventoryEditor } from '@/components/InventoryEditor';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { LeaseTabs, List, PageHeader, Row, Section } from '@/components/ui';
import { ApiError } from '@/lib/api';
import {
  cancelLeaseInvitation,
  generateDocument,
  generateHandoverAct,
  getDocument,
  getHandoverAct,
  getLease,
  Lease,
  LeaseDocument,
  LeaseSignedScan,
  listSignedScans,
  sendLease,
  STATUS_LABEL,
  uploadSignedScan,
} from '@/lib/leases';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { usePolling } from '@/lib/usePolling';
import {
  formatDateRu,
  getPartyInfoStatus,
  PartyInfoStatus,
} from '@/lib/party-info';

const ROLE_LABEL = { landlord: 'Собственник', tenant: 'Арендатор' };

function LeaseDetailInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [lease, setLease] = useState<Lease | null>(null);
  const [scans, setScans] = useState<LeaseSignedScan[]>([]);
  const [doc, setDoc] = useState<LeaseDocument | null>(null);
  const [piStatus, setPiStatus] = useState<PartyInfoStatus | null>(null);
  const [showDoc, setShowDoc] = useState(false);
  const [actHtml, setActHtml] = useState<string | null>(null);
  const [showAct, setShowAct] = useState(false);
  const [itemsCount, setItemsCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [editingInvite, setEditingInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const l = await getLease(id);
      setLease(l);
      setPiStatus(await getPartyInfoStatus(id).catch(() => null));
      if (l.status === 'sent' || l.status === 'active') {
        setScans(await listSignedScans(id));
      }
      try {
        setDoc(await getDocument(id));
      } catch {
        setDoc(null);
      }
      try {
        setActHtml((await getHandoverAct(id)).content);
      } catch {
        setActHtml(null);
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
      setEditingInvite(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка отправки');
    } finally {
      setBusy(false);
    }
  }

  // Отзыв приглашения возвращает договор в черновик (ADR-0020) — например,
  // если landlord передумал сдавать этому арендатору.
  async function onCancelInvite() {
    setBusy(true);
    setError(null);
    try {
      await cancelLeaseInvitation(id);
      setEditingInvite(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка отмены');
    } finally {
      setBusy(false);
    }
  }

  async function onGenerate() {
    setBusy(true);
    setError(null);
    try {
      setDoc(await generateDocument(id));
      setShowDoc(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка генерации');
    } finally {
      setBusy(false);
    }
  }

  // Приложение №1 к договору (ADR-0018) — версионируется отдельно от текста
  // договора, пересобирается из текущей описи.
  async function onGenerateAct() {
    setBusy(true);
    setError(null);
    try {
      setActHtml((await generateHandoverAct(id)).content);
      setShowAct(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка генерации акта');
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

  // Генерация документов и правка описи — только собственник (эндпоинты
  // landlord-only), причём опись — только пока договор черновик.
  const isLandlord = !!lease && !!user && lease.landlordId === user.id;
  const inventoryEditable = isLandlord && lease?.status === 'draft';
  const latestPartyUpdate = piStatus
    ? [piStatus.self.updatedAt, piStatus.counterparty.updatedAt]
        .filter((value): value is string => Boolean(value))
        .reduce<string | null>(
          (latest, value) =>
            !latest || new Date(value) > new Date(latest) ? value : latest,
          null,
        )
    : null;
  const documentOutdated = Boolean(
    isLandlord &&
      doc &&
      latestPartyUpdate &&
      new Date(latestPartyUpdate) > new Date(doc.createdAt),
  );

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
              title={lease.property.address}
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
                <div className="fact">
                  <div className="k">{isLandlord ? 'АРЕНДАТОР' : 'СОБСТВЕННИК'}</div>
                  <div className="v" style={{ overflowWrap: 'anywhere' }}>
                    {isLandlord
                      ? lease.tenant
                        ? `${lease.tenant.fullName} · ${lease.tenant.email}`
                        : 'Ещё не принял приглашение'
                      : `${lease.landlord.fullName} · ${lease.landlord.email}`}
                  </div>
                </div>
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
                isLandlord ? (
                  <button className="link" onClick={onGenerate} disabled={busy}>
                    {doc ? 'Перегенерировать' : 'Сгенерировать'}
                  </button>
                ) : undefined
              }
            >
              {doc ? (
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
                      srcDoc={doc.content}
                      style={{ width: '100%', height: 460, border: 'none', background: '#fff' }}
                    />
                  )}
                </div>
              ) : (
                <div className="empty">Текст ещё не сгенерирован.</div>
              )}
            </Section>

            <Section
              title="Опись имущества"
              action={
                itemsCount > 0 ? (
                  <span className="muted">{itemsCount} поз.</span>
                ) : undefined
              }
            >
              {inventoryEditable && (
                <div className="hint">
                  Что передаётся вместе с помещением — техника и мебель. Из
                  этого списка собирается Приложение №1; менять его можно,
                  пока договор остаётся черновиком.
                </div>
              )}
              <InventoryEditor
                leaseId={id}
                editable={inventoryEditable}
                onCountChange={setItemsCount}
              />
            </Section>

            <Section
              title="Приложение №1 — акт приёма-передачи"
              action={
                isLandlord ? (
                  <button className="link" onClick={onGenerateAct} disabled={busy}>
                    {actHtml ? 'Перегенерировать' : 'Сгенерировать'}
                  </button>
                ) : undefined
              }
            >
              {actHtml ? (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <button
                    className="row"
                    onClick={() => setShowAct((v) => !v)}
                    style={{ borderBottom: showAct ? '1px solid var(--border-default)' : 'none' }}
                  >
                    <span className="lead"><span style={{ fontSize: 18 }}>📦</span></span>
                    <span className="body"><span className="t">Акт приёма-передачи имущества</span><span className="s">{showAct ? 'Скрыть' : 'Показать текст'}</span></span>
                  </button>
                  {showAct && (
                    <iframe
                      title="Акт приёма-передачи"
                      srcDoc={actHtml}
                      style={{ width: '100%', height: 460, border: 'none', background: '#fff' }}
                    />
                  )}
                </div>
              ) : (
                <div className="empty">
                  Акт ещё не сгенерирован — печатается и подписывается вместе с
                  договором.
                </div>
              )}
            </Section>

            <Section title="Персональные данные сторон">
              {piStatus ? (
                <>
                  <List>
                    {(['landlord', 'tenant'] as const).map((role) => {
                      const own = role === piStatus.role;
                      const party = own
                        ? piStatus.self
                        : piStatus.counterparty;
                      return (
                        <Row
                          key={role}
                          icon={party.filled ? 'check' : 'clock'}
                          iconVariant={party.filled ? undefined : 'warm'}
                          title={ROLE_LABEL[role]}
                          subtitle={
                            party.filled && party.updatedAt
                              ? `Внесены ${formatDateRu(party.updatedAt)}`
                              : 'Не внесены'
                          }
                          href={own ? `/leases/${id}/party-info` : undefined}
                          chevron={own}
                        />
                      );
                    })}
                  </List>
                  {documentOutdated && (
                    <div className="hint">
                      Текст договора сгенерирован раньше, чем стороны внесли
                      данные — перегенерируйте, иначе в нём останутся прочерки.
                    </div>
                  )}
                </>
              ) : (
                <div className="empty">Статус загружается…</div>
              )}
            </Section>

            {isLandlord && lease.status === 'draft' && (
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

            {isLandlord && lease.status === 'sent' && lease.invitation && (
              <Section title="Приглашение">
                {editingInvite ? (
                  <form className="card" onSubmit={onSend}>
                    <div className="hint">
                      Прошлое приглашение перестанет действовать — арендатор
                      получит новое по указанному адресу.
                    </div>
                    <div className="field">
                      <label>Email арендатора</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tenant@mail.ru"
                        required
                      />
                    </div>
                    <div className="table-actions">
                      <button type="submit" disabled={busy}>
                        {busy ? 'Отправка…' : 'Отправить заново'}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => setEditingInvite(false)}
                      >
                        Отмена
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="card">
                    <div className="facts">
                      <div className="fact">
                        <div className="k">ОТПРАВЛЕНО НА</div>
                        <div className="v" style={{ overflowWrap: 'anywhere' }}>
                          {lease.invitation.invitedEmail}
                        </div>
                      </div>
                      <div className="fact">
                        <div className="k">КОГДА</div>
                        <div className="v">
                          {lease.invitation.createdAt.slice(0, 10)}
                        </div>
                      </div>
                    </div>
                    <div className="hint" style={{ marginTop: 12 }}>
                      Арендатор ещё не принял приглашение. Проверьте адрес — если
                      в нём опечатка, отправьте заново на верный.
                    </div>
                    <div className="table-actions">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          setEmail(lease.invitation?.invitedEmail ?? '');
                          setEditingInvite(true);
                        }}
                      >
                        Изменить адрес
                      </button>
                      <button className="secondary" disabled={busy} onClick={onCancelInvite}>
                        Отозвать
                      </button>
                    </div>
                  </div>
                )}
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
