'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { PageHeader } from '@/components/ui';
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

  return (
    <>
      <TopBar />
      <div className="container">
        <PageHeader
          back={`/leases/${id}`}
          title="Персональные данные"
          subtitle={lease?.property.address}
        />
        {error && <div className="error">{error}</div>}
        {!lease || !status || !policy ? (
          error ? null : <p className="muted">Загрузка…</p>
        ) : (
          <form className="card" onSubmit={onSubmit}>
            {readOnly ? (
              <div className="hint">
                Договор расторгнут — данные заморожены и будут удалены по
                истечении срока хранения (3 года).
              </div>
            ) : (
              <div className="hint">
                Сервис на тестовом стенде — вносите вымышленные данные.
                Итоговая редакция политики обработки персональных данных ещё
                готовится.
              </div>
            )}

            <div className="field">
              <label>ФИО</label>
              <input value={user?.fullName ?? ''} disabled />
              <span className="muted">Из профиля, попадает в договор</span>
            </div>
            <div className="field">
              <label>Серия паспорта</label>
              <input
                inputMode="numeric"
                value={form.passportSeries}
                onChange={(e) =>
                  update('passportSeries', e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                disabled={readOnly}
              />
              {fieldErrors.passportSeries && <span className="error">{fieldErrors.passportSeries}</span>}
            </div>
            <div className="field">
              <label>Номер паспорта</label>
              <input
                inputMode="numeric"
                value={form.passportNumber}
                onChange={(e) =>
                  update('passportNumber', e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                disabled={readOnly}
              />
              {fieldErrors.passportNumber && <span className="error">{fieldErrors.passportNumber}</span>}
            </div>
            <div className="field">
              <label>Кем выдан</label>
              <input
                value={form.passportIssuedBy}
                onChange={(e) => update('passportIssuedBy', e.target.value)}
                maxLength={200}
                disabled={readOnly}
              />
              {fieldErrors.passportIssuedBy && <span className="error">{fieldErrors.passportIssuedBy}</span>}
            </div>
            <div className="field">
              <label>Дата рождения</label>
              <input
                type="date"
                value={form.birthDate}
                onChange={(e) => update('birthDate', e.target.value)}
                disabled={readOnly}
              />
              {fieldErrors.birthDate && <span className="error">{fieldErrors.birthDate}</span>}
            </div>
            <div className="field">
              <label>Адрес регистрации</label>
              <textarea
                value={form.registrationAddress}
                onChange={(e) => update('registrationAddress', e.target.value)}
                maxLength={300}
                rows={3}
                disabled={readOnly}
              />
              {fieldErrors.registrationAddress && <span className="error">{fieldErrors.registrationAddress}</span>}
            </div>
            <div className="field">
              <label>Телефон (необязательно)</label>
              <input
                type="tel"
                placeholder="+7 999 123-45-67"
                value={form.phone ?? ''}
                onChange={(e) => update('phone', e.target.value)}
                onBlur={() => update('phone', normalizePhone(form.phone ?? ''))}
                disabled={readOnly}
              />
              {fieldErrors.phone && <span className="error">{fieldErrors.phone}</span>}
            </div>

            {!readOnly && needsConsent ? (
              <div>
                {stored && (
                  <p className="muted">
                    Редакция политики изменилась — подтвердите согласие заново
                  </p>
                )}
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  <span>
                    Я даю согласие на обработку моих персональных данных в
                    соответствии с{' '}
                    <Link href="/legal/privacy" target="_blank" rel="noreferrer">
                      политикой
                    </Link>
                  </span>
                </label>
              </div>
            ) : stored?.consentAcceptedAt ? (
              <p className="muted">
                Согласие дано {formatDateRu(stored.consentAcceptedAt)}, редакция{' '}
                {stored.consentPolicyVersion}
              </p>
            ) : null}

            {!readOnly && (
              <button
                type="submit"
                disabled={busy || (needsConsent && !accepted)}
                style={{ width: '100%' }}
              >
                {busy ? 'Сохранение…' : 'Сохранить'}
              </button>
            )}
            {saved && (
              <p className="pill ok" style={{ marginTop: 12 }}>
                Данные сохранены
              </p>
            )}
          </form>
        )}
      </div>
    </>
  );
}

export default function PartyInfoPage() {
  return (
    <RequireAuth>
      <PartyInfoInner />
    </RequireAuth>
  );
}
