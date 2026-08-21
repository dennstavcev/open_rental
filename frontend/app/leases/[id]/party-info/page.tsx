'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, Check, Clock, Info } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { List, Row } from '@/components/List';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { StatusPill } from '@/components/StatusPill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getLease, Lease } from '@/lib/leases';
import { getPrivacyPolicy, PrivacyPolicy } from '@/lib/legal';
import {
  formatDateRu,
  getOwnPartyInfo,
  getPartyInfoStatus,
  normalizePhone,
  PartyInfo,
  PartyInfoStatus,
  PartyInfoView,
  savePartyInfo,
} from '@/lib/party-info';

const EMPTY_INFO: PartyInfo = {
  passportSeries: '',
  passportNumber: '',
  passportIssuedBy: '',
  birthDate: '',
  registrationAddress: '',
  phone: '',
};

type FieldErrors = Partial<Record<keyof PartyInfo, string>>;

function validate(info: PartyInfo): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^\d{4}$/.test(info.passportSeries)) {
    errors.passportSeries = 'Укажите 4 цифры';
  }
  if (!/^\d{6}$/.test(info.passportNumber)) {
    errors.passportNumber = 'Укажите 6 цифр';
  }
  if (info.passportIssuedBy.trim().length < 5) {
    errors.passportIssuedBy = 'Укажите, кем выдан паспорт (не менее 5 символов)';
  } else if (info.passportIssuedBy.length > 200) {
    errors.passportIssuedBy = 'Не более 200 символов';
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(info.birthDate);
  if (!match) {
    errors.birthDate = 'Укажите дату рождения';
  } else {
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    const now = new Date();
    let age = now.getUTCFullYear() - y;
    if (
      now.getUTCMonth() + 1 < m ||
      (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)
    ) {
      age -= 1;
    }
    if (
      parsed.getUTCFullYear() !== y ||
      parsed.getUTCMonth() !== m - 1 ||
      parsed.getUTCDate() !== d ||
      parsed > now ||
      age > 120
    ) {
      errors.birthDate = 'Дата рождения указана неверно';
    } else if (age < 18) {
      errors.birthDate = 'Сторона договора должна быть совершеннолетней';
    }
  }

  const addressLength = info.registrationAddress.trim().length;
  if (addressLength < 10) {
    errors.registrationAddress = 'Укажите адрес не короче 10 символов';
  } else if (info.registrationAddress.length > 300) {
    errors.registrationAddress = 'Не более 300 символов';
  }
  const phone = normalizePhone(info.phone ?? '');
  if (phone && !/^\+7\d{10}$/.test(phone)) {
    errors.phone = 'Телефон должен быть в формате +7 999 123-45-67';
  }
  return errors;
}

function PartyInfoInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [lease, setLease] = useState<Lease | null>(null);
  const [status, setStatus] = useState<PartyInfoStatus | null>(null);
  const [policy, setPolicy] = useState<PrivacyPolicy | null>(null);
  const [stored, setStored] = useState<PartyInfoView | null>(null);
  const [form, setForm] = useState<PartyInfo>(EMPTY_INFO);
  const [accepted, setAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const ownPromise = getOwnPartyInfo(id).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      });
      const [loadedLease, loadedStatus, own, loadedPolicy] = await Promise.all([
        getLease(id),
        getPartyInfoStatus(id),
        ownPromise,
        getPrivacyPolicy(),
      ]);
      setLease(loadedLease);
      setStatus(loadedStatus);
      setStored(own);
      setPolicy(loadedPolicy);
      setForm(
        own
          ? {
              passportSeries: own.passportSeries,
              passportNumber: own.passportNumber,
              passportIssuedBy: own.passportIssuedBy,
              birthDate: own.birthDate,
              registrationAddress: own.registrationAddress,
              phone: own.phone ?? '',
            }
          : EMPTY_INFO,
      );
      setAccepted(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof PartyInfo>(key: K, value: PartyInfo[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setSaved(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!status || !policy || lease?.status === 'terminated') return;

    const normalizedPhone = normalizePhone(form.phone ?? '');
    const prepared: PartyInfo = {
      ...form,
      passportIssuedBy: form.passportIssuedBy.trim(),
      registrationAddress: form.registrationAddress.trim(),
      ...(normalizedPhone ? { phone: normalizedPhone } : { phone: undefined }),
    };
    const errors = validate(prepared);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await savePartyInfo(id, {
        ...prepared,
        ...(status.self.needsConsent
          ? {
              consentAccepted: accepted,
              // Версия именно показанного текста, а не эхо status endpoint.
              policyVersion: policy.version,
            }
          : {}),
      });
      const [own, nextStatus] = await Promise.all([
        getOwnPartyInfo(id),
        getPartyInfoStatus(id),
      ]);
      setStored(own);
      setStatus(nextStatus);
      setForm({ ...prepared, phone: prepared.phone ?? '' });
      setAccepted(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  const readOnly = lease?.status === 'terminated';
  const needsConsent = status?.self.needsConsent ?? true;

  const ROLE_LABEL = { landlord: 'Собственник', tenant: 'Арендатор' } as const;

  return (
    <AppShell>
      <PageHeader
        back={`/leases/${id}`}
        backLabel="Договор"
        title="Персональные данные"
        subtitle={lease?.property.address}
      />

      {error && (
        <p
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
        >
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}

      {!lease || !status || !policy ? (
        error ? null : (
          <p className="text-content-muted">Загрузка…</p>
        )
      ) : (
        // Форма не растягивается на весь десктоп: поля паспорта короткие,
        // а строка длиной в экран читается хуже. Справа — контекст.
        <div className="lg:grid lg:grid-cols-[minmax(0,560px)_320px] lg:items-start lg:gap-10">
          <form onSubmit={onSubmit} className="space-y-4">
            <p
              className={`flex gap-2 rounded-md px-4 py-3 text-sm ${
                readOnly ? 'bg-sand-200/60 text-content-secondary' : 'bg-sand-200/60 text-content-secondary'
              }`}
            >
              <Info aria-hidden className="size-4 shrink-0 text-content-muted" />
              <span className="max-w-prose">
                {readOnly
                  ? 'Договор расторгнут — данные заморожены и будут удалены по истечении срока хранения (3 года).'
                  : 'Сервис на тестовом стенде — вносите вымышленные данные. Итоговая редакция политики обработки персональных данных ещё готовится.'}
              </span>
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="pi-name">ФИО</Label>
              <Input id="pi-name" value={user?.fullName ?? ''} disabled />
              <p className="text-sm text-content-muted">Из профиля, попадает в договор</p>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="min-w-32 flex-1 space-y-1.5">
                <Label htmlFor="pi-series">Серия паспорта</Label>
                <Input
                  id="pi-series"
                  inputMode="numeric"
                  value={form.passportSeries}
                  invalid={Boolean(fieldErrors.passportSeries)}
                  onChange={(e) =>
                    update('passportSeries', e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  disabled={readOnly}
                />
                {fieldErrors.passportSeries && (
                  <p className="flex items-center gap-1.5 text-sm text-danger">
                    <AlertTriangle aria-hidden className="size-4 shrink-0" />
                    {fieldErrors.passportSeries}
                  </p>
                )}
              </div>

              <div className="min-w-32 flex-1 space-y-1.5">
                <Label htmlFor="pi-number">Номер паспорта</Label>
                <Input
                  id="pi-number"
                  inputMode="numeric"
                  value={form.passportNumber}
                  invalid={Boolean(fieldErrors.passportNumber)}
                  onChange={(e) =>
                    update('passportNumber', e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  disabled={readOnly}
                />
                {fieldErrors.passportNumber && (
                  <p className="flex items-center gap-1.5 text-sm text-danger">
                    <AlertTriangle aria-hidden className="size-4 shrink-0" />
                    {fieldErrors.passportNumber}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pi-issued">Кем выдан</Label>
              <Input
                id="pi-issued"
                value={form.passportIssuedBy}
                invalid={Boolean(fieldErrors.passportIssuedBy)}
                onChange={(e) => update('passportIssuedBy', e.target.value)}
                maxLength={200}
                disabled={readOnly}
              />
              {fieldErrors.passportIssuedBy && (
                <p className="flex items-center gap-1.5 text-sm text-danger">
                  <AlertTriangle aria-hidden className="size-4 shrink-0" />
                  {fieldErrors.passportIssuedBy}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pi-birth">Дата рождения</Label>
              <Input
                id="pi-birth"
                type="date"
                value={form.birthDate}
                invalid={Boolean(fieldErrors.birthDate)}
                onChange={(e) => update('birthDate', e.target.value)}
                disabled={readOnly}
              />
              {fieldErrors.birthDate && (
                <p className="flex items-center gap-1.5 text-sm text-danger">
                  <AlertTriangle aria-hidden className="size-4 shrink-0" />
                  {fieldErrors.birthDate}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pi-address">Адрес регистрации</Label>
              <Textarea
                id="pi-address"
                value={form.registrationAddress}
                invalid={Boolean(fieldErrors.registrationAddress)}
                onChange={(e) => update('registrationAddress', e.target.value)}
                maxLength={300}
                rows={3}
                disabled={readOnly}
              />
              {fieldErrors.registrationAddress && (
                <p className="flex items-center gap-1.5 text-sm text-danger">
                  <AlertTriangle aria-hidden className="size-4 shrink-0" />
                  {fieldErrors.registrationAddress}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pi-phone">Телефон (необязательно)</Label>
              <Input
                id="pi-phone"
                type="tel"
                placeholder="+7 999 123-45-67"
                value={form.phone ?? ''}
                invalid={Boolean(fieldErrors.phone)}
                onChange={(e) => update('phone', e.target.value)}
                onBlur={() => update('phone', normalizePhone(form.phone ?? ''))}
                disabled={readOnly}
              />
              {fieldErrors.phone && (
                <p className="flex items-center gap-1.5 text-sm text-danger">
                  <AlertTriangle aria-hidden className="size-4 shrink-0" />
                  {fieldErrors.phone}
                </p>
              )}
            </div>

            {!readOnly && needsConsent ? (
              <div className="space-y-2">
                {stored && (
                  <p className="text-sm text-content-muted">
                    Редакция политики изменилась — подтвердите согласие заново
                  </p>
                )}
                <label className="flex cursor-pointer items-start gap-3 text-sm text-content-secondary">
                  <Checkbox
                    className="mt-0.5"
                    checked={accepted}
                    onCheckedChange={(checked) => setAccepted(checked === true)}
                  />
                  <span className="max-w-prose">
                    Я даю согласие на обработку моих персональных данных в соответствии с{' '}
                    <Link
                      href="/legal/privacy"
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-sm text-violet-500 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      политикой
                    </Link>
                  </span>
                </label>
              </div>
            ) : stored?.consentAcceptedAt ? (
              <p className="text-sm text-content-muted">
                Согласие дано {formatDateRu(stored.consentAcceptedAt)}, редакция{' '}
                {stored.consentPolicyVersion}
              </p>
            ) : null}

            {!readOnly && (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={busy || (needsConsent && !accepted)}>
                  {busy ? 'Сохранение…' : 'Сохранить'}
                </Button>
                {saved && <StatusPill tone="success">Данные сохранены</StatusPill>}
              </div>
            )}
          </form>

          <Card className="mt-8 lg:mt-0">
            <div className="p-5">
              <h2 className="text-lg font-bold text-content">Зачем это нужно</h2>
              <p className="mt-2 max-w-prose text-sm text-content-secondary">
                Паспортные данные обеих сторон печатаются в тексте договора. Без них в
                договоре останутся прочерки.
              </p>
            </div>
            <List className="border-b-0">
              {(['landlord', 'tenant'] as const).map((role) => {
                const own = role === status.role;
                const party = own ? status.self : status.counterparty;
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
                  />
                );
              })}
            </List>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

export default function PartyInfoPage() {
  return (
    <RequireAuth>
      <PartyInfoInner />
    </RequireAuth>
  );
}
