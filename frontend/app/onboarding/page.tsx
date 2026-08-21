'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check } from 'lucide-react';
import { InventoryEditor } from '@/components/InventoryEditor';
import { RequireAuth } from '@/components/RequireAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/components/ui/cn';
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

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const STEP_TITLES = [
  'Объект недвижимости',
  'Счётчики и услуги',
  'Условия договора',
  'Опись имущества',
  'Пригласить арендатора',
];

/**
 * Мастер — одноразовый сценарий без навигации приложения: она бы уводила
 * с полпути. Прогресс на десктопе показан списком шагов слева, на
 * мобильном — полосой: вертикальный список съел бы весь первый экран.
 */
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

  const current = Math.min(step, 5);

  return (
    <div data-app className="min-h-screen bg-app-gradient text-content">
      <header className="flex items-center justify-between px-screen py-4">
        <span className="text-base font-bold tracking-wide">SOFTRENT</span>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard">Выйти из мастера</Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-5xl px-screen pb-16">
        <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">
          Сдача объекта за 5 шагов
        </h1>
        <p className="mt-2 max-w-prose text-content-muted">
          Проведём от пустого профиля до отправленного арендатору договора: объект →
          счётчики/услуги → условия → опись имущества → приглашение.
        </p>

        <div className="mt-8 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:gap-10">
          {/* Мобильный индикатор */}
          <div className="lg:hidden">
            <p className="text-sm text-content-muted">Шаг {current} из 5</p>
            <div className="mt-2 flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className={cn(
                    'h-1 flex-1 rounded-pill',
                    step >= n ? 'bg-violet-500' : 'bg-sand-200',
                  )}
                />
              ))}
            </div>
          </div>

          {/* Десктопный список шагов */}
          <ol className="hidden lg:block">
            {STEP_TITLES.map((title, i) => {
              const n = i + 1;
              const done = step > n;
              const active = current === n;
              return (
                <li key={title} className="flex gap-3 pb-6 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-pill text-sm font-semibold',
                        active && 'bg-violet-500 text-content-onAccent',
                        done && 'bg-sand-200 text-ink-700',
                        !active && !done && 'border border-line-strong text-content-muted',
                      )}
                    >
                      {done ? <Check aria-hidden className="size-4" /> : n}
                    </span>
                    {n < STEP_TITLES.length && (
                      <span
                        className={cn('mt-1 w-px flex-1', done ? 'bg-sand-300' : 'bg-line')}
                      />
                    )}
                  </div>
                  <span
                    className={cn(
                      'pt-1',
                      active ? 'font-bold text-content' : 'text-content-muted',
                    )}
                  >
                    {title}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 lg:mt-0">
            {error && (
              <p
                role="alert"
                className="mb-4 flex items-center gap-2 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
              >
                <AlertTriangle aria-hidden className="size-4 shrink-0" />
                {error}
              </p>
            )}

            {step === 1 && (
              <StepProperty
                busy={busy}
                guard={guard}
                onDone={(id) => {
                  setPropertyId(id);
                  setStep(2);
                }}
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
            {step === 4 && <StepInventory leaseId={leaseId} onNext={() => setStep(5)} />}
            {step === 5 && (
              <StepInvite
                leaseId={leaseId}
                busy={busy}
                guard={guard}
                onDone={() => setStep(6)}
              />
            )}
            {step === 6 && (
              <Card className="p-6">
                <h2 className="text-xl font-bold">Готово! Что дальше</h2>
                <p className="mt-2 text-content-muted">
                  Объект создан, договор отправлен арендатору. Дальше:
                </p>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-content-secondary">
                  <li>Арендатор принимает приглашение из письма.</li>
                  <li>
                    Обе стороны загружают сканы подписанного договора — после этого он
                    станет «Действует».
                  </li>
                  <li>Появится первый счёт, арендатор сможет подавать показания.</li>
                </ol>
                <Button asChild className="mt-5">
                  <Link href={`/leases/${leaseId}`}>Открыть договор</Link>
                </Button>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Общая обёртка шага: заголовок, пояснение, поля. */
function StepCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-2 max-w-prose text-content-muted">{hint}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </Card>
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
      <StepCard
        title="Шаг 1. Объект недвижимости"
        hint="Начните с квартиры/помещения, которое сдаёте. Достаточно адреса — тип и площадь можно указать сейчас или позже. Именно добавление объекта делает вас собственником в системе."
      >
        <div className="space-y-1.5">
          <Label htmlFor="ob-address">Адрес</Label>
          <Input
            id="ob-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label htmlFor="ob-type">Тип</Label>
            <Input
              id="ob-type"
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              required
            />
          </div>
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label htmlFor="ob-area">Площадь, кв.м (необязательно)</Label>
            <Input
              id="ob-area"
              type="number"
              step="0.01"
              min={0}
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" disabled={busy}>
          Далее
        </Button>
      </StepCard>
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
    <StepCard
      title="Шаг 2. Счётчики и услуги"
      hint="Необязательно, но экономит время потом. Счётчики (свет/вода/газ) нужны, чтобы арендатор подавал показания, а стоимость коммуналки автоматически попадала в счёт. Услуги (интернет, уборка) — ежемесячные добавляются в каждый счёт сами. Можно пропустить и добавить позже в карточке объекта."
    >
      <div>
        <p className="text-sm text-content-muted">
          Услуги: {services.map((s) => s.name).join(', ') || '—'}
        </p>
        <form
          className="mt-2 flex flex-wrap gap-3"
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
        >
          <Input
            aria-label="Название услуги"
            placeholder="Услуга"
            className="min-w-40 flex-1"
            value={svcName}
            onChange={(e) => setSvcName(e.target.value)}
            required
          />
          <Input
            aria-label="Стоимость услуги, ₽"
            type="number"
            placeholder="₽"
            className="w-28"
            value={svcPrice}
            onChange={(e) => setSvcPrice(e.target.value)}
            required
          />
          <Select
            aria-label="Тип услуги"
            className="w-auto min-w-40"
            value={svcType}
            onChange={(e) => setSvcType(e.target.value as ServiceType)}
          >
            <option value="monthly">Ежемесячная</option>
            <option value="one_time">Разовая</option>
          </Select>
          <Button type="submit" variant="secondary" disabled={busy}>
            Добавить услугу
          </Button>
        </form>
      </div>

      <div className="border-t border-line pt-4">
        <p className="text-sm text-content-muted">
          Счётчики: {meters.map((m) => m.name).join(', ') || '—'}
        </p>
        <form
          className="mt-2 flex flex-wrap gap-3"
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
        >
          <Select
            aria-label="Тип счётчика"
            className="w-auto min-w-44"
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
          </Select>
          <Input
            aria-label="Название счётчика"
            placeholder="Название"
            className="min-w-36 flex-1"
            value={mName}
            onChange={(e) => setMName(e.target.value)}
            required
          />
          <Input
            aria-label="Тариф"
            type="number"
            step="0.0001"
            placeholder="Тариф"
            className="w-28"
            value={mTariff}
            onChange={(e) => setMTariff(e.target.value)}
            required
          />
          <Input
            aria-label="Начальное показание"
            type="number"
            step="0.001"
            min={0}
            placeholder="Начальное показание"
            className="w-44"
            value={mInitialReading}
            onChange={(e) => setMInitialReading(e.target.value)}
            required
          />
          <Button type="submit" variant="secondary" disabled={busy}>
            Добавить счётчик
          </Button>
        </form>
      </div>

      <Button onClick={onNext} disabled={busy}>
        Далее
      </Button>
    </StepCard>
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
      <StepCard
        title="Шаг 3. Условия договора"
        hint="Задайте срок, размер аренды и «день оплаты» — число месяца, от которого считаются расчётные периоды и формируются счета. Ставка пени применяется при просрочке оплаты (0 — без пени). Пока это черновик: договор вступит в силу только после подписания сканов обеими сторонами."
      >
        <div className="flex flex-wrap gap-4">
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label htmlFor="ob-start">Дата начала</Label>
            <Input
              id="ob-start"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setEndDate(addElevenMonths(e.target.value));
              }}
              required
            />
          </div>
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label htmlFor="ob-end">Дата окончания</Label>
            <Input
              id="ob-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-rent">Аренда, ₽/мес</Label>
          <Input
            id="ob-rent"
            type="number"
            value={rentAmount}
            onChange={(e) => setRentAmount(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="min-w-32 flex-1 space-y-1.5">
            <Label htmlFor="ob-deposit">Депозит, ₽</Label>
            <Input
              id="ob-deposit"
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
          </div>
          <div className="min-w-32 flex-1 space-y-1.5">
            <Label htmlFor="ob-day">День оплаты (1–28)</Label>
            <Input
              id="ob-day"
              type="number"
              min={1}
              max={28}
              value={paymentDay}
              onChange={(e) => setPaymentDay(e.target.value)}
            />
          </div>
          <div className="min-w-32 flex-1 space-y-1.5">
            <Label htmlFor="ob-penalty">Пеня, %/день</Label>
            <Input
              id="ob-penalty"
              type="number"
              step="0.01"
              min={0}
              value={penalty}
              onChange={(e) => setPenalty(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" disabled={busy}>
          Далее
        </Button>
      </StepCard>
    </form>
  );
}

// Шаг описи (ADR-0018): предметная часть — что именно передаётся вместе с
// помещением — выносится в Приложение №1.
function StepInventory({ leaseId, onNext }: { leaseId: string; onNext: () => void }) {
  return (
    <StepCard
      title="Шаг 4. Опись имущества"
      hint="Перечислите технику и мебель, которые передаёте вместе с помещением — из этого списка формируется Приложение №1 «Акт приёма-передачи имущества». Шаг можно пропустить и дополнить опись позже, пока договор остаётся черновиком."
    >
      <InventoryEditor leaseId={leaseId} editable />
      <Button onClick={onNext} block>
        Далее
      </Button>
    </StepCard>
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
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void guard(async () => {
          await sendLease(leaseId, email);
          onDone();
        });
      }}
    >
      <StepCard
        title="Шаг 5. Пригласить арендатора"
        hint="Укажите email арендатора — ему придёт приглашение. Он регистрируется по этому адресу, принимает приглашение и становится арендатором договора. Нельзя пригласить самого себя."
      >
        <div className="space-y-1.5">
          <Label htmlFor="ob-email">Email арендатора</Label>
          <Input
            id="ob-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={busy}>
          Отправить приглашение
        </Button>
      </StepCard>
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
