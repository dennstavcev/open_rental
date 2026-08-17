'use client';

import { FormEvent, useRef, useState } from 'react';
import Link from 'next/link';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { ApiError } from '@/lib/api';
import { createProperty } from '@/lib/properties';
import { addElevenMonths, createLease, sendLease } from '@/lib/leases';
import {
  createMeter,
  createService,
  Meter,
  METER_DEFAULT_TARIFF,
  MeterType,
  Service,
  ServiceType,
} from '@/lib/catalog';

type Step = 1 | 2 | 3 | 4 | 5;

function OnboardingInner() {
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [propertyId, setPropertyId] = useState('');
  const [leaseId, setLeaseId] = useState('');

  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <h1>Сдача объекта за 4 шага</h1>
        <p className="muted">
          Проведём от пустого профиля до отправленного арендатору договора:
          объект → счётчики/услуги → условия → приглашение.
        </p>
        <div className="stepper">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`seg ${step >= n ? 'on' : ''}`} />
          ))}
        </div>
        <p className="muted">Шаг {Math.min(step, 4)} из 4</p>
        {error && <div className="error">{error}</div>}

        {step === 1 && (
          <StepProperty
            busy={busy}
            onDone={(id) => {
              setPropertyId(id);
              setStep(2);
            }}
            guard={guard}
          />
        )}
        {step === 2 && (
          <StepCatalog
            propertyId={propertyId}
            busy={busy}
            guard={guard}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <StepLease
            propertyId={propertyId}
            busy={busy}
            guard={guard}
            onDone={(id) => {
              setLeaseId(id);
              setStep(4);
            }}
          />
        )}
        {step === 4 && (
          <StepInvite
            leaseId={leaseId}
            busy={busy}
            guard={guard}
            onDone={() => setStep(5)}
          />
        )}
        {step === 5 && (
          <div className="card">
            <h3>Готово! Что дальше</h3>
            <p className="muted">
              Объект создан, договор отправлен арендатору. Дальше:
            </p>
            <ol className="muted" style={{ paddingLeft: 18, margin: '8px 0' }}>
              <li>Арендатор принимает приглашение из письма.</li>
              <li>Обе стороны загружают сканы подписанного договора — после
                этого он станет «Действует».</li>
              <li>Появится первый счёт, арендатор сможет подавать показания.</li>
            </ol>
            <Link href={`/leases/${leaseId}`}>
              <button>Открыть договор</button>
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

function StepProperty({
  busy,
  guard,
  onDone,
}: {
  busy: boolean;
  guard: (fn: () => Promise<void>) => Promise<void>;
  onDone: (id: string) => void;
}) {
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState('Квартира');
  const [area, setArea] = useState('');

  return (
    <form
      className="card"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void guard(async () => {
          const p = await createProperty({
            address,
            propertyType,
            areaSqm: area ? Number(area) : undefined,
          });
          onDone(p.id);
        });
      }}
    >
      <h3>Шаг 1. Объект недвижимости</h3>
      <p className="muted">
        Начните с квартиры/помещения, которое сдаёте. Достаточно адреса —
        тип и площадь можно указать сейчас или позже. Именно добавление
        объекта делает вас собственником в системе.
      </p>
      <div className="field">
        <label>Адрес</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} required />
      </div>
      <div className="field">
        <label>Тип</label>
        <input value={propertyType} onChange={(e) => setPropertyType(e.target.value)} required />
      </div>
      <div className="field">
        <label>Площадь, кв.м (необязательно)</label>
        <input type="number" step="0.01" value={area} onChange={(e) => setArea(e.target.value)} min={0} />
      </div>
      <button type="submit" disabled={busy}>
        Далее
      </button>
    </form>
  );
}

function StepCatalog({
  propertyId,
  busy,
  guard,
  onNext,
}: {
  propertyId: string;
  busy: boolean;
  guard: (fn: () => Promise<void>) => Promise<void>;
  onNext: () => void;
}) {
  const [services, setServices] = useState<Service[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);

  const [svcName, setSvcName] = useState('');
  const [svcPrice, setSvcPrice] = useState('');
  const [svcType, setSvcType] = useState<ServiceType>('monthly');

  const [mName, setMName] = useState('');
  const [mType, setMType] = useState<MeterType>('electricity');
  const [mTariff, setMTariff] = useState(String(METER_DEFAULT_TARIFF.electricity));
  const [mInitialReading, setMInitialReading] = useState('');

  return (
    <div className="card">
      <h3>Шаг 2. Счётчики и услуги</h3>
      <p className="muted">
        Необязательно, но экономит время потом. Счётчики (свет/вода/газ)
        нужны, чтобы арендатор подавал показания, а стоимость коммуналки
        автоматически попадала в счёт. Услуги (интернет, уборка) —
        ежемесячные добавляются в каждый счёт сами. Можно пропустить и
        добавить позже в карточке объекта.
      </p>

      <div className="muted">Услуги: {services.map((s) => s.name).join(', ') || '—'}</div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void guard(async () => {
            const s = await createService(propertyId, {
              name: svcName,
              price: Number(svcPrice),
              serviceType: svcType,
            });
            setServices((x) => [...x, s]);
            setSvcName('');
            setSvcPrice('');
          });
        }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}
      >
        <input placeholder="Услуга" value={svcName} onChange={(e) => setSvcName(e.target.value)} required />
        <input type="number" placeholder="₽" value={svcPrice} onChange={(e) => setSvcPrice(e.target.value)} required />
        <select value={svcType} onChange={(e) => setSvcType(e.target.value as ServiceType)}>
          <option value="monthly">Ежемесячная</option>
          <option value="one_time">Разовая</option>
        </select>
        <button className="secondary" type="submit" disabled={busy}>
          + услуга
        </button>
      </form>

      <div className="muted">Счётчики: {meters.map((m) => m.name).join(', ') || '—'}</div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void guard(async () => {
            const m = await createMeter(propertyId, {
              meterType: mType,
              name: mName,
              tariff: Number(mTariff),
              initialReading: Number(mInitialReading),
            });
            setMeters((x) => [...x, m]);
            setMName('');
            setMInitialReading('');
          });
        }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}
      >
        <select
          value={mType}
          onChange={(e) => {
            const type = e.target.value as MeterType;
            setMType(type);
            setMTariff(String(METER_DEFAULT_TARIFF[type]));
          }}
        >
          <option value="electricity">Электричество</option>
          <option value="water">Вода</option>
          <option value="gas">Газ</option>
          <option value="heating">Отопление</option>
        </select>
        <input placeholder="Название" value={mName} onChange={(e) => setMName(e.target.value)} required />
        <input type="number" step="0.0001" placeholder="Тариф" value={mTariff} onChange={(e) => setMTariff(e.target.value)} required />
        <input
          type="number"
          step="0.001"
          min={0}
          placeholder="Начальное показание"
          value={mInitialReading}
          onChange={(e) => setMInitialReading(e.target.value)}
          required
        />
        <button className="secondary" type="submit" disabled={busy}>
          + счётчик
        </button>
      </form>

      <button onClick={onNext} disabled={busy} style={{ marginTop: 8 }}>
        Далее
      </button>
    </div>
  );
}

function StepLease({
  propertyId,
  busy,
  guard,
  onDone,
}: {
  propertyId: string;
  busy: boolean;
  guard: (fn: () => Promise<void>) => Promise<void>;
  onDone: (id: string) => void;
}) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('0');
  const [paymentDay, setPaymentDay] = useState('20');
  const [penalty, setPenalty] = useState('0.1');

  return (
    <form
      className="card"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void guard(async () => {
          const l = await createLease(propertyId, {
            startDate,
            endDate,
            rentAmount: Number(rentAmount),
            depositAmount: Number(depositAmount),
            paymentDay: Number(paymentDay),
            penaltyRatePercentPerDay: Number(penalty),
          });
          onDone(l.id);
        });
      }}
    >
      <h3>Шаг 3. Условия договора</h3>
      <p className="muted">
        Задайте срок, размер аренды и «день оплаты» — число месяца, от
        которого считаются расчётные периоды и формируются счета. Ставка
        пени применяется при просрочке оплаты (0 — без пени). Пока это
        черновик: договор вступит в силу только после подписания сканов
        обеими сторонами.
      </p>
      <div className="field">
        <label>Дата начала</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setEndDate(addElevenMonths(e.target.value));
          }}
          required
        />
      </div>
      <div className="field">
        <label>Дата окончания</label>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
      </div>
      <div className="field">
        <label>Аренда, ₽/мес</label>
        <input type="number" value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} required />
      </div>
      <div className="field">
        <label>Задаток, ₽</label>
        <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
      </div>
      <div className="field">
        <label>День оплаты (1–28)</label>
        <input type="number" value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} min={1} max={28} />
      </div>
      <div className="field">
        <label>Пеня, %/день</label>
        <input type="number" step="0.01" value={penalty} onChange={(e) => setPenalty(e.target.value)} min={0} />
      </div>
      <button type="submit" disabled={busy}>
        Далее
      </button>
    </form>
  );
}

function StepInvite({
  leaseId,
  busy,
  guard,
  onDone,
}: {
  leaseId: string;
  busy: boolean;
  guard: (fn: () => Promise<void>) => Promise<void>;
  onDone: () => void;
}) {
  const [email, setEmail] = useState('');
  return (
    <form
      className="card"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void guard(async () => {
          await sendLease(leaseId, email);
          onDone();
        });
      }}
    >
      <h3>Шаг 4. Пригласить арендатора</h3>
      <p className="muted">
        Укажите email арендатора — ему придёт приглашение. Он
        регистрируется по этому адресу, принимает приглашение и становится
        арендатором договора. Нельзя пригласить самого себя.
      </p>
      <div className="field">
        <label>Email арендатора</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <button type="submit" disabled={busy}>
        Отправить приглашение
      </button>
    </form>
  );
}

export default function OnboardingPage() {
  return (
    <RequireAuth>
      <OnboardingInner />
    </RequireAuth>
  );
}
