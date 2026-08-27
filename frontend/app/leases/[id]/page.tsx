'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  FileText,
  Package,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { InventoryEditor } from '@/components/InventoryEditor';
import { LeaseStatusPill } from '@/components/LeaseStatusPill';
import { LeaseTabs } from '@/components/LeaseTabs';
import { List, Row } from '@/components/List';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { Section } from '@/components/Section';
import { StatusPill } from '@/components/StatusPill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import {
  cancelLeaseInvitation,
  confirmReturnAct,
  downloadSignedScan,
  generateDocument,
  generateHandoverAct,
  generateReturnAct,
  getDocument,
  getHandoverAct,
  getLease,
  getReturnAct,
  Lease,
  LeaseDocument,
  LeaseInventoryItem,
  LeaseSignedScan,
  listInventoryItems,
  listSignedScans,
  sendLease,
  submitReturnAct,
  uploadSignedScan,
} from '@/lib/leases';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { usePolling } from '@/lib/usePolling';
import { formatDateRu, getPartyInfoStatus, PartyInfoStatus } from '@/lib/party-info';

const ROLE_LABEL = { landlord: 'Собственник', tenant: 'Арендатор' };

/** Пара «лейбл — значение» в карточке условий. */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-t border-line px-5 py-3 first:border-t-0">
      <p className="text-xs font-semibold uppercase tracking-label text-content-muted">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold text-content [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}

/** Раскрывающийся документ: строка-переключатель и iframe с текстом. */
function DocumentPreview({
  title,
  html,
  open,
  onToggle,
}: {
  title: string;
  html: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors duration-fast hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-icon text-content-secondary">
          <FileText aria-hidden className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-content">{title}</span>
          <span className="block text-sm text-content-muted">
            {open ? 'Скрыть' : 'Показать текст'}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={`size-5 shrink-0 text-content-muted transition-transform duration-fast ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <iframe
          title={title}
          srcDoc={html}
          className="h-[460px] w-full border-t border-line bg-white"
        />
      )}
    </div>
  );
}

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
  const [returnActDoc, setReturnActDoc] = useState<LeaseDocument | null>(null);
  const [showReturnAct, setShowReturnAct] = useState(false);
  const [returnItems, setReturnItems] = useState<LeaseInventoryItem[]>([]);
  const [itemsCount, setItemsCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [editingInvite, setEditingInvite] = useState(false);
  const [origin, setOrigin] = useState('');
  const [inviteCopied, setInviteCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const returnActOutdated = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const l = await getLease(id);
      setLease(l);
      const inventory = await listInventoryItems(id);
      setReturnItems(inventory);
      setItemsCount(inventory.length);
      setPiStatus(await getPartyInfoStatus(id).catch(() => null));
      if (
        l.status === 'sent' ||
        l.status === 'active' ||
        l.status === 'terminated'
      ) {
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
      if (l.status === 'terminated' && !returnActOutdated.current) {
        try {
          setReturnActDoc(await getReturnAct(id));
        } catch {
          setReturnActDoc(null);
        }
      } else if (l.status !== 'terminated') {
        setReturnActDoc(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(
    () => setOrigin(process.env.NEXT_PUBLIC_APP_URL || window.location.origin),
    [],
  );
  usePolling(load, 30000);

  const inviteLink =
    origin && lease?.invitation?.token
      ? `${origin}/register?invite=${lease.invitation.token}`
      : '';

  async function onSend(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendLease(id, email);
      setEditingInvite(false);
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Ошибка отправки';
      await load();
      setError(message);
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
      const message = err instanceof ApiError ? err.message : 'Ошибка отмены';
      await load();
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function onCopyInvite() {
    if (!(await copyText(inviteLink))) {
      setError('Не удалось скопировать — выделите ссылку вручную');
      return;
    }
    setError(null);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1500);
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

  async function onSubmitReturnAct() {
    setBusy(true);
    setError(null);
    try {
      await submitReturnAct(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка отправки акта');
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmReturnAct() {
    setBusy(true);
    setError(null);
    try {
      await confirmReturnAct(id);
      // Черновая печатная версия больше не соответствует подтверждённому
      // снимку: её нужно сформировать заново.
      returnActOutdated.current = true;
      setReturnActDoc(null);
      setShowReturnAct(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка подтверждения акта');
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateReturnAct() {
    setBusy(true);
    setError(null);
    try {
      const generated = await generateReturnAct(id);
      returnActOutdated.current = false;
      setReturnActDoc(generated);
      setShowReturnAct(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка генерации акта возврата');
    } finally {
      setBusy(false);
    }
  }

  async function onReturnStateChanged() {
    returnActOutdated.current = true;
    setReturnActDoc(null);
    setShowReturnAct(false);
    await load();
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

  async function openSignedScan(scanId: string) {
    setError(null);
    try {
      const blob = await downloadSignedScan(id, scanId);
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось открыть скан');
    }
  }

  // Генерация документов и правка описи — только собственник (эндпоинты
  // landlord-only), причём опись — только пока договор черновик.
  const isLandlord = !!lease && !!user && lease.landlordId === user.id;
  const isTenant = !!lease && !!user && lease.tenantId === user.id;
  const inventoryEditable = isLandlord && lease?.status === 'draft';
  const returnEditable = Boolean(
    isLandlord && lease?.status === 'terminated' && !lease.returnActConfirmedAt,
  );
  const returnComplete = returnItems.every((item) => item.returnStatus !== null);
  const returnDamageTotal = lease?.returnActConfirmedAt
    ? Number(lease.returnActDamageTotal ?? 0)
    : returnItems.reduce((total, item) => {
        if (item.returnStatus !== 'damaged' && item.returnStatus !== 'missing') {
          return total;
        }
        return total + Number(item.damageAmount ?? 0);
      }, 0);
  const returnUncovered = lease?.returnActConfirmedAt
    ? Number(lease.returnActUncovered ?? 0)
    : Math.max(returnDamageTotal - Number(lease?.depositReturnAmount ?? 0), 0);
  const latestPartyUpdate = piStatus
    ? [piStatus.self.updatedAt, piStatus.counterparty.updatedAt]
        .filter((value): value is string => Boolean(value))
        .reduce<string | null>(
          (latest, value) => (!latest || new Date(value) > new Date(latest) ? value : latest),
          null,
        )
    : null;
  const documentOutdated = Boolean(
    isLandlord && doc && latestPartyUpdate && new Date(latestPartyUpdate) > new Date(doc.createdAt),
  );

  return (
    <AppShell>
      {error && (
        <p
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
        >
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}

      {!lease ? (
        error ? null : (
          <p className="text-content-muted">Загрузка…</p>
        )
      ) : (
        <>
          <PageHeader
            back="/properties"
            backLabel="Аренда"
            title={lease.property.address}
            action={<LeaseStatusPill status={lease.status} />}
          />

          {(lease.status === 'active' || lease.status === 'terminated') &&
            lease.tenantId && (
              <LeaseTabs id={id} archived={lease.status === 'terminated'} />
            )}

          {/* Десктоп: условия и статус сторон слева фиксированной колонкой,
              документы и сканы — справа. Одной узкой колонкой этот экран
              читается хуже всего: он самый плотный в продукте. */}
          <div className="lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-10">
            <div className="space-y-6">
              <Card>
                <Fact label="Аренда" value={`${formatMoney(lease.rentAmount)} ₽/мес`} />
                <Fact label="Депозит" value={`${formatMoney(lease.depositAmount)} ₽`} />
                <Fact label="День оплаты" value={`${lease.paymentDay} числа`} />
                <Fact
                  label="Пеня"
                  value={`${lease.penaltyRatePercentPerDay}%/день`}
                />
                <Fact
                  label="Срок"
                  value={`${lease.startDate.slice(0, 10)} — ${lease.endDate.slice(0, 10)}`}
                />
                <Fact
                  label={isLandlord ? 'Арендатор' : 'Собственник'}
                  value={
                    isLandlord
                      ? lease.tenant
                        ? `${lease.tenant.fullName} · ${lease.tenant.email}`
                        : 'Ещё не принял приглашение'
                      : `${lease.landlord.fullName} · ${lease.landlord.email}`
                  }
                />
              </Card>

              <div className="flex flex-wrap justify-between gap-3 text-sm">
                <Button asChild variant="link" size="sm" className="px-0">
                  <Link href={`/properties/${lease.propertyId}`}>
                    Объект <ArrowRight aria-hidden />
                  </Link>
                </Button>
                {lease.status === 'active' && lease.tenantId && (
                  <Button asChild variant="link" size="sm" className="px-0">
                    <Link href={`/leases/${id}/termination`}>
                      Расторжение договора <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                )}
              </div>

              <Section title="Персональные данные сторон" className="mt-0">
                {piStatus ? (
                  <>
                    <List>
                      {(['landlord', 'tenant'] as const).map((role) => {
                        const own = role === piStatus.role;
                        const party = own ? piStatus.self : piStatus.counterparty;
                        return (
                          <Row
                            key={role}
                            icon={party.filled ? Check : Clock}
                            iconTone={party.filled ? 'success' : 'warn'}
                            title={ROLE_LABEL[role]}
                            subtitle={
                              party.filled && party.updatedAt
                                ? `Внесены ${formatDateRu(party.updatedAt)}`
                                : 'Не внесены'
                            }
                            href={own ? `/leases/${id}/party-info` : undefined}
                          />
                        );
                      })}
                    </List>
                    {documentOutdated && (
                      <p className="mt-3 flex gap-2 rounded-md bg-sand-200/60 px-4 py-3 text-sm text-content-secondary">
                        <AlertTriangle aria-hidden className="size-4 shrink-0 text-warn" />
                        Текст договора сгенерирован раньше, чем стороны внесли данные —
                        перегенерируйте, иначе в нём останутся прочерки.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-content-muted">Статус загружается…</p>
                )}
              </Section>

              {isLandlord && lease.status === 'draft' && (
                <Section title="Отправить арендатору" className="mt-0">
                  <form onSubmit={onSend} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="tenant-email">Email арендатора</Label>
                      <Input
                        id="tenant-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tenant@mail.ru"
                        required
                      />
                    </div>
                    <Button type="submit" block disabled={busy}>
                      {busy ? 'Отправка…' : 'Отправить приглашение'}
                    </Button>
                  </form>
                </Section>
              )}

              {isLandlord &&
                lease.status === 'sent' &&
                lease.invitation && (
                <Section title="Приглашение" className="mt-0">
                  {editingInvite ? (
                    <form onSubmit={onSend} className="space-y-3">
                      <p className="text-sm text-content-muted">
                        Прошлое приглашение перестанет действовать — арендатор получит
                        новое по указанному адресу.
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor="invite-email">Email арендатора</Label>
                        <Input
                          id="invite-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="tenant@mail.ru"
                          required
                        />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button type="submit" disabled={busy}>
                          {busy ? 'Отправка…' : 'Отправить заново'}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => setEditingInvite(false)}
                        >
                          Отмена
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <Card>
                      <Fact label="Отправлено на" value={lease.invitation.invitedEmail} />
                      <Fact label="Когда" value={lease.invitation.createdAt.slice(0, 10)} />
                      {inviteLink && (
                        <div className="border-t border-line p-5">
                          <p className="font-mono text-sm text-content [overflow-wrap:anywhere] break-all">
                            {inviteLink}
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="mt-3"
                            onClick={() => void onCopyInvite()}
                          >
                            {inviteCopied ? 'Скопировано' : 'Скопировать ссылку'}
                          </Button>
                          <p className="mt-3 text-sm text-content-muted">
                            Отправьте её арендатору любым удобным способом — почтой,
                            мессенджером. Ссылка привязана к указанному адресу почты.
                          </p>
                        </div>
                      )}
                      <div className="border-t border-line p-5">
                        <p className="text-sm text-content-muted">
                          {lease.invitation.status === 'declined'
                            ? 'Арендатор отклонил приглашение. Его можно отправить заново на тот же или другой адрес.'
                            : 'Арендатор ещё не принял приглашение. Проверьте адрес — если в нём опечатка, отправьте заново на верный.'}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              setEmail(lease.invitation?.invitedEmail ?? '');
                              setEditingInvite(true);
                            }}
                          >
                            Изменить адрес
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={onCancelInvite}
                          >
                            Отозвать
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}
                </Section>
              )}
            </div>

            <div className="mt-8 lg:mt-0">
              <Section
                title="Текст договора"
                className="mt-0"
                action={
                  isLandlord ? (
                    <Button variant="link" size="sm" onClick={onGenerate} disabled={busy}>
                      {doc ? 'Перегенерировать' : 'Сгенерировать'}
                    </Button>
                  ) : undefined
                }
              >
                {doc ? (
                  <DocumentPreview
                    title="Договор аренды"
                    html={doc.content}
                    open={showDoc}
                    onToggle={() => setShowDoc((v) => !v)}
                  />
                ) : (
                  <p className="rounded-md border border-line px-5 py-6 text-center text-content-muted">
                    Текст ещё не сгенерирован.
                  </p>
                )}
              </Section>

              <Section
                title="Опись имущества"
                action={
                  itemsCount > 0 ? (
                    <span className="text-content-muted">{itemsCount} поз.</span>
                  ) : undefined
                }
              >
                {inventoryEditable && (
                  <p className="mb-3 max-w-prose text-sm text-content-muted">
                    Что передаётся вместе с помещением — техника и мебель. Из этого
                    списка собирается Приложение №1; менять его можно, пока договор
                    остаётся черновиком.
                  </p>
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
                    <Button
                      variant="link"
                      size="sm"
                      onClick={onGenerateAct}
                      disabled={busy}
                    >
                      {actHtml ? 'Перегенерировать' : 'Сгенерировать'}
                    </Button>
                  ) : undefined
                }
              >
                {actHtml ? (
                  <DocumentPreview
                    title="Акт приёма-передачи имущества"
                    html={actHtml}
                    open={showAct}
                    onToggle={() => setShowAct((v) => !v)}
                  />
                ) : (
                  <div className="flex flex-col items-center rounded-md border border-line px-6 py-8 text-center">
                    <Package aria-hidden className="size-8 text-content-muted" strokeWidth={1.5} />
                    <p className="mt-3 max-w-prose text-content-muted">
                      Акт ещё не сгенерирован — печатается и подписывается вместе с
                      договором.
                    </p>
                  </div>
                )}
              </Section>

              {lease.status === 'terminated' && (
                <Section
                  title="Акт возврата имущества"
                  action={
                    lease.returnActConfirmedAt ? (
                      <StatusPill tone="success">
                        Подтверждён {formatDateRu(lease.returnActConfirmedAt)}
                      </StatusPill>
                    ) : lease.returnActSubmittedAt ? (
                      <StatusPill tone="warn">Ожидает подтверждения</StatusPill>
                    ) : (
                      <StatusPill>Ожидает заполнения</StatusPill>
                    )
                  }
                >
                  <p className="mb-4 max-w-prose text-sm text-content-muted">
                    Зафиксируйте состояние каждой позиции. Состав описи после
                    заключения договора не меняется.
                  </p>
                  <InventoryEditor
                    leaseId={id}
                    editable={returnEditable}
                    returnMode
                    onChanged={() => void onReturnStateChanged()}
                  />

                  <Card className="mt-4">
                    <Fact
                      label="Итого ущерб"
                      value={`${formatMoney(returnDamageTotal)} ₽`}
                    />
                    <Fact
                      label="Депозит к возврату"
                      value={`${formatMoney(lease.depositReturnAmount ?? 0)} ₽`}
                    />
                    {returnUncovered > 0 && (
                      <Fact
                        label="Задолженность сверх депозита"
                        value={`${formatMoney(returnUncovered)} ₽`}
                      />
                    )}
                  </Card>

                  {isLandlord && !lease.returnActConfirmedAt && (
                    <div className="mt-4">
                      <p className="mb-3 max-w-prose text-sm text-content-muted">
                        После подтверждения арендатора сумма ущерба уменьшит возврат
                        депозита. Подтверждённые значения изменить нельзя.
                      </p>
                      <Button
                        onClick={onSubmitReturnAct}
                        disabled={busy || !returnComplete}
                      >
                        {busy ? 'Отправка…' : 'Отправить на подтверждение'}
                      </Button>
                    </div>
                  )}

                  {isTenant && !lease.returnActConfirmedAt && (
                    <div className="mt-4">
                      <Button
                        onClick={onConfirmReturnAct}
                        disabled={busy || !lease.returnActSubmittedAt}
                      >
                        {busy ? 'Подтверждение…' : 'Подтвердить акт'}
                      </Button>
                    </div>
                  )}

                  <div className="mt-5 border-t border-line pt-5">
                    {isLandlord && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={onGenerateReturnAct}
                        disabled={busy}
                      >
                        {returnActDoc ? 'Перегенерировать документ' : 'Сгенерировать документ'}
                      </Button>
                    )}
                    {returnActOutdated.current && !returnActDoc && (
                      <p className="mt-3 flex gap-2 rounded-md bg-sand-200/60 px-4 py-3 text-sm text-content-secondary">
                        <AlertTriangle aria-hidden className="size-4 shrink-0 text-warn" />
                        Ранее сгенерированный документ устарел — сформируйте новую
                        версию после изменений.
                      </p>
                    )}
                    {returnActDoc ? (
                      <div className="mt-3">
                        <DocumentPreview
                          title="Акт возврата имущества"
                          html={returnActDoc.content}
                          open={showReturnAct}
                          onToggle={() => setShowReturnAct((value) => !value)}
                        />
                      </div>
                    ) : (
                      !returnActOutdated.current && (
                        <p className="mt-3 text-sm text-content-muted">
                          Документ ещё не сгенерирован.
                        </p>
                      )
                    )}
                  </div>
                </Section>
              )}

              {(lease.status === 'sent' ||
                lease.status === 'active' ||
                lease.status === 'terminated') && (
                <Section title="Подписанные сканы">
                  <p className="mb-3 max-w-prose text-sm text-content-muted">
                    {lease.status === 'terminated'
                      ? 'Подписанные сторонами экземпляры завершённого договора.'
                      : 'Распечатайте текст, подпишите обеими сторонами и загрузите сканы. Договор активируется автоматически, когда сканы загрузят оба.'}
                  </p>
                  <List>
                    {(['landlord', 'tenant'] as const).map((role) => {
                      const scan = scans.find((s) => s.role === role);
                      return (
                        <Row
                          key={role}
                          icon={scan ? Check : Clock}
                          iconTone={scan ? 'success' : 'warn'}
                          title={ROLE_LABEL[role]}
                          subtitle={
                            scan ? `Загружен ${scan.confirmedAt.slice(0, 10)}` : 'Ожидается скан'
                          }
                          onClick={scan ? () => void openSignedScan(scan.id) : undefined}
                        />
                      );
                    })}
                  </List>

                  {lease.status === 'sent' && (
                    <form
                      onSubmit={onUpload}
                      className="mt-4 flex flex-wrap items-center gap-3"
                    >
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,application/pdf"
                        className="min-w-0 flex-1 text-sm text-content-secondary file:mr-3 file:rounded-pill file:border file:border-line-strong file:bg-transparent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-content"
                      />
                      <Button type="submit" disabled={busy}>
                        {busy ? 'Загрузка…' : 'Загрузить скан'}
                      </Button>
                    </form>
                  )}

                  {lease.status === 'active' && (
                    <p className="mt-4">
                      <StatusPill tone="success">Договор заключён и действует</StatusPill>
                    </p>
                  )}
                </Section>
              )}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

export default function LeaseDetailPage() {
  return (
    <RequireAuth>
      <LeaseDetailInner />
    </RequireAuth>
  );
}
