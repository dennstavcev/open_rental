'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { useRouter } from 'next/navigation';
import { EmptyState, List, PageHeader, Row, Section, Segmented, Sheet } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { getProperty, Property } from '@/lib/properties';
import { addElevenMonths, createLease, Lease, listLeases, STATUS_LABEL } from '@/lib/leases';
import {
  createMeter,
  createService,
  listMeters,
  listServices,
  Meter,
  METER_DEFAULT_TARIFF,
  METER_TYPE_LABEL,
  METER_UNIT_LABEL,
  MeterType,
  Service,
  SERVICE_TYPE_LABEL,
  ServiceType,
  submitReading,
  updateMeter,
} from '@/lib/catalog';
import { formatMoney } from '@/lib/format';

type SheetKind = null | 'service' | 'meter' | 'reading' | 'editMeter' | 'lease';

function PropertyDetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);

  const [lStartDate, setLStartDate] = useState('');
  const [lEndDate, setLEndDate] = useState('');
  const [lRentAmount, setLRentAmount] = useState('');
  const [lDepositAmount, setLDepositAmount] = useState('0');
  const [lPaymentDay, setLPaymentDay] = useState('20');
  const [lPenalty, setLPenalty] = useState('0.1');

  const [svcName, setSvcName] = useState('');
  const [svcPrice, setSvcPrice] = useState('');
  const [svcType, setSvcType] = useState<ServiceType>('monthly');

  const [mName, setMName] = useState('');
  const [mType, setMType] = useState<MeterType>('electricity');
  const [mSerialNumber, setMSerialNumber] = useState('');
  const [mTariff, setMTariff] = useState(String(METER_DEFAULT_TARIFF.electricity));
  const [mInitialReading, setMInitialReading] = useState('');
  const [mCalibrationDueDate, setMCalibrationDueDate] = useState('');

  const [editMeterId, setEditMeterId] = useState('');
  const [eName, setEName] = useState('');
  const [eSerialNumber, setESerialNumber] = useState('');
  const [eTariff, setETariff] = useState('');
  const [eActive, setEActive] = useState(true);
  const [eCalibrationDueDate, setECalibrationDueDate] = useState('');

  const [readMeterId, setReadMeterId] = useState('');
  const [readValue, setReadValue] = useState('');
  const readFileRef = useRef<HTMLInputElement>(null);
  const [readMsg, setReadMsg] = useState<string | null>(null);
  const selectedMeter = meters.find((m) => m.id === readMeterId) ?? null;
  const previewConsumption =
    selectedMeter && readValue !== '' && !Number.isNaN(Number(readValue))
      ? Number(readValue) - selectedMeter.lastReadingValue
      : null;
  const previewCost =
    previewConsumption != null && selectedMeter
      ? previewConsumption * Number(selectedMeter.tariff)
      : null;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, s, m, l] = await Promise.all([
        getProperty(id),
        listServices(id),
        listMeters(id),
        listLeases(),
      ]);
      setProperty(p);
      setServices(s);
      setMeters(m);
      setLeases(l.filter((x) => x.propertyId === id));
      if (m.length && !readMeterId) setReadMeterId(m[0].id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function closeSheet() {
    setSheet(null);
    setError(null);
  }

  async function onAddService(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createService(id, { name: svcName, price: Number(svcPrice), serviceType: svcType });
      setSvcName('');
      setSvcPrice('');
      closeSheet();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function onAddMeter(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createMeter(id, {
        meterType: mType,
        name: mName,
        serialNumber: mSerialNumber || undefined,
        tariff: Number(mTariff),
        initialReading: Number(mInitialReading),
        calibrationDueDate: mCalibrationDueDate || undefined,
      });
      setMName('');
      setMSerialNumber('');
      setMTariff(String(METER_DEFAULT_TARIFF[mType]));
      setMInitialReading('');
      setMCalibrationDueDate('');
      closeSheet();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function onMeterTypeChange(type: MeterType) {
    setMType(type);
    setMTariff(String(METER_DEFAULT_TARIFF[type]));
  }

  function openEditMeter(m: Meter) {
    setEditMeterId(m.id);
    setEName(m.name);
    setESerialNumber(m.serialNumber ?? '');
    setETariff(m.tariff);
    setEActive(m.isActive);
    setECalibrationDueDate(m.calibrationDueDate ? m.calibrationDueDate.slice(0, 10) : '');
    setSheet('editMeter');
  }

  async function onSaveMeterEdit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateMeter(id, editMeterId, {
        name: eName,
        serialNumber: eSerialNumber || undefined,
        tariff: Number(eTariff),
        isActive: eActive,
        calibrationDueDate: eCalibrationDueDate || undefined,
      });
      closeSheet();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function selectMeterForReading(meterId: string) {
    setReadMeterId(meterId);
    const m = meters.find((mm) => mm.id === meterId);
    setReadValue(m ? String(m.lastReadingValue) : '');
  }

  function openReadingSheet() {
    const initialId = readMeterId || meters[0]?.id || '';
    selectMeterForReading(initialId);
    setSheet('reading');
  }

  async function onSubmitReading(e: FormEvent) {
    e.preventDefault();
    const photo = readFileRef.current?.files?.[0];
    if (!photo || !readValue || !readMeterId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await submitReading(readMeterId, Number(readValue), photo);
      setReadMsg(
        `Принято: расход ${r.consumption}, начислено ${formatMoney(r.cost)} ₽` +
          (r.warning ? ` — ${r.warning}` : ''),
      );
      setReadValue('');
      if (readFileRef.current) readFileRef.current.value = '';
      closeSheet();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateLease(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const l = await createLease(id, {
        startDate: lStartDate,
        endDate: lEndDate,
        rentAmount: Number(lRentAmount),
        depositAmount: Number(lDepositAmount),
        paymentDay: Number(lPaymentDay),
        penaltyRatePercentPerDay: Number(lPenalty),
      });
      router.push(`/leases/${l.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
      setBusy(false);
    }
  }

  const addBtn = (kind: SheetKind) => (
    <button className="link" onClick={() => setSheet(kind)}>
      + Добавить
    </button>
  );

  return (
    <>
      <TopBar />
      <div className="container">
        {!property ? (
          <p className="muted">Загрузка…</p>
        ) : (
          <>
            <PageHeader
              back="/properties"
              title={property.address}
              subtitle={`${property.propertyType}${property.areaSqm ? ` · ${property.areaSqm} м²` : ''} · ${property.timezone}`}
            />
            {error && !sheet && <div className="error">{error}</div>}
            {readMsg && <div className="hint">{readMsg}</div>}

            <Section
              title="Договор"
              action={leases.length === 0 ? addBtn('lease') : undefined}
            >
              {leases.length === 0 ? (
                <div className="empty">По этому объекту ещё нет договора.</div>
              ) : (
                <List>
                  {leases.map((l) => (
                    <Row
                      key={l.id}
                      icon="doc"
                      title={`Договор · ${formatMoney(l.rentAmount)} ₽/мес`}
                      subtitle={`${l.startDate.slice(0, 10)} — ${l.endDate.slice(0, 10)}`}
                      trail={
                        <span className={`pill ${l.status === 'active' ? 'ok' : ''}`}>
                          {STATUS_LABEL[l.status]}
                        </span>
                      }
                      href={`/leases/${l.id}`}
                    />
                  ))}
                </List>
              )}
            </Section>

            <Section title="Счётчики" action={addBtn('meter')}>
              {meters.length === 0 ? (
                <div className="empty">Счётчиков пока нет.</div>
              ) : (
                <List>
                  {meters.map((m) => (
                    <Row
                      key={m.id}
                      icon="gauge"
                      title={m.name}
                      subtitle={
                        `${METER_TYPE_LABEL[m.meterType]}` +
                        (m.serialNumber ? ` · № ${m.serialNumber}` : '') +
                        ` · ${m.lastReadingValue} ${METER_UNIT_LABEL[m.meterType]}` +
                        (m.isActive ? '' : ' · отключён')
                      }
                      trail={`${formatMoney(m.tariff)} ₽`}
                      onClick={() => openEditMeter(m)}
                    />
                  ))}
                </List>
              )}
              {meters.some((m) => m.isActive) && (
                <button className="secondary" style={{ width: '100%' }} onClick={openReadingSheet}>
                  Подать показание
                </button>
              )}
            </Section>

            <Section title="Услуги" action={addBtn('service')}>
              {services.length === 0 ? (
                <div className="empty">Услуг пока нет.</div>
              ) : (
                <List>
                  {services.map((s) => (
                    <Row
                      key={s.id}
                      icon="wallet"
                      title={s.name}
                      subtitle={SERVICE_TYPE_LABEL[s.serviceType]}
                      trail={`${formatMoney(s.price)} ₽`}
                      chevron={false}
                    />
                  ))}
                </List>
              )}
            </Section>
          </>
        )}
      </div>

      {sheet === 'lease' && (
        <Sheet title="Новый договор" onClose={closeSheet}>
          <form onSubmit={onCreateLease}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Начало</label>
                <input
                  type="date"
                  value={lStartDate}
                  onChange={(e) => {
                    setLStartDate(e.target.value);
                    setLEndDate(addElevenMonths(e.target.value));
                  }}
                  required
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Окончание</label>
                <input type="date" value={lEndDate} onChange={(e) => setLEndDate(e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label>Аренда, ₽/мес</label>
              <input type="number" value={lRentAmount} onChange={(e) => setLRentAmount(e.target.value)} required />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Депозит, ₽</label>
                <input type="number" value={lDepositAmount} onChange={(e) => setLDepositAmount(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>День оплаты</label>
                <input type="number" value={lPaymentDay} onChange={(e) => setLPaymentDay(e.target.value)} min={1} max={28} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Пеня, %/день</label>
                <input type="number" step="0.01" value={lPenalty} onChange={(e) => setLPenalty(e.target.value)} min={0} />
              </div>
            </div>
            {error && <div className="error">{error}</div>}
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={closeSheet}>Отмена</button>
              <button type="submit" disabled={busy}>{busy ? 'Создание…' : 'Создать черновик'}</button>
            </div>
          </form>
        </Sheet>
      )}

      {sheet === 'service' && (
        <Sheet title="Новая услуга" onClose={closeSheet}>
          <form onSubmit={onAddService}>
            <div className="field">
              <label>Название</label>
              <input value={svcName} onChange={(e) => setSvcName(e.target.value)} placeholder="Интернет, уборка…" required />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Стоимость, ₽</label>
                <input type="number" value={svcPrice} onChange={(e) => setSvcPrice(e.target.value)} required />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Тип</label>
                <select value={svcType} onChange={(e) => setSvcType(e.target.value as ServiceType)}>
                  <option value="monthly">Ежемесячная</option>
                  <option value="one_time">Разовая</option>
                </select>
              </div>
            </div>
            {error && <div className="error">{error}</div>}
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={closeSheet}>Отмена</button>
              <button type="submit" disabled={busy}>Добавить</button>
            </div>
          </form>
        </Sheet>
      )}

      {sheet === 'meter' && (
        <Sheet title="Новый счётчик" onClose={closeSheet}>
          <form onSubmit={onAddMeter}>
            <div className="field">
              <label>Название</label>
              <input placeholder="напр. ГВС, Электро день" value={mName} onChange={(e) => setMName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Серийный номер</label>
              <input placeholder="необязательно" value={mSerialNumber} onChange={(e) => setMSerialNumber(e.target.value)} />
            </div>
            <div className="field">
              <label>Тип счётчика</label>
              <select value={mType} onChange={(e) => onMeterTypeChange(e.target.value as MeterType)}>
                <option value="electricity">Электричество</option>
                <option value="water">Вода</option>
                <option value="gas">Газ</option>
                <option value="heating">Отопление</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Начальное показание, {METER_UNIT_LABEL[mType]}</label>
                <input type="number" step="0.001" min={0} value={mInitialReading} onChange={(e) => setMInitialReading(e.target.value)} required />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Тариф, ₽/{METER_UNIT_LABEL[mType]}</label>
                <input type="number" step="0.0001" value={mTariff} onChange={(e) => setMTariff(e.target.value)} required />
              </div>
            </div>
            <p className="muted">
              Значение на приборе на момент постановки на учёт — от него считается расход первого показания.
            </p>
            <div className="field">
              <label>Дата поверки (необязательно)</label>
              <input type="date" value={mCalibrationDueDate} onChange={(e) => setMCalibrationDueDate(e.target.value)} />
            </div>
            {error && <div className="error">{error}</div>}
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={closeSheet}>Отмена</button>
              <button type="submit" disabled={busy}>Добавить</button>
            </div>
          </form>
        </Sheet>
      )}

      {sheet === 'editMeter' && (
        <Sheet title="Счётчик" onClose={closeSheet}>
          <form onSubmit={onSaveMeterEdit}>
            <div className="field">
              <label>Название</label>
              <input value={eName} onChange={(e) => setEName(e.target.value)} required />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Серийный номер</label>
                <input placeholder="необязательно" value={eSerialNumber} onChange={(e) => setESerialNumber(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Тариф</label>
                <input type="number" step="0.0001" value={eTariff} onChange={(e) => setETariff(e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label>Статус</label>
              <Segmented<'active' | 'off'>
                options={[
                  { value: 'active', label: 'Активен' },
                  { value: 'off', label: 'Отключён' },
                ]}
                value={eActive ? 'active' : 'off'}
                onChange={(v) => setEActive(v === 'active')}
              />
            </div>
            {!eActive && (
              <p className="muted">Отключённый счётчик не будет принимать новые показания.</p>
            )}
            <div className="field">
              <label>Дата поверки (необязательно)</label>
              <input type="date" value={eCalibrationDueDate} onChange={(e) => setECalibrationDueDate(e.target.value)} />
            </div>
            {error && <div className="error">{error}</div>}
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={closeSheet}>Отмена</button>
              <button type="submit" disabled={busy}>Сохранить</button>
            </div>
          </form>
        </Sheet>
      )}

      {sheet === 'reading' && (
        <Sheet title="Показание счётчика" onClose={closeSheet}>
          <form onSubmit={onSubmitReading}>
            <div className="field">
              <label>Счётчик</label>
              <select value={readMeterId} onChange={(e) => selectMeterForReading(e.target.value)}>
                {meters.filter((m) => m.isActive).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({METER_TYPE_LABEL[m.meterType]})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                Новое показание{selectedMeter ? `, ${METER_UNIT_LABEL[selectedMeter.meterType]}` : ''}
              </label>
              <input type="number" step="0.001" value={readValue} onChange={(e) => setReadValue(e.target.value)} required />
              {selectedMeter && (
                <p className="muted">Текущее: {selectedMeter.lastReadingValue} {METER_UNIT_LABEL[selectedMeter.meterType]}</p>
              )}
              {previewConsumption != null && previewConsumption < 0 && (
                <p className="error">Новое показание не может быть меньше текущего</p>
              )}
            </div>
            {previewConsumption != null && previewConsumption >= 0 && (
              <p className="hint">
                Расход {previewConsumption.toFixed(3)} {selectedMeter ? METER_UNIT_LABEL[selectedMeter.meterType] : ''}
                {' · начислится '}
                {previewCost != null ? formatMoney(previewCost) : ''} ₽
              </p>
            )}
            <div className="field">
              <label>Фото счётчика</label>
              <input ref={readFileRef} type="file" accept="image/jpeg,image/png" required />
            </div>
            <p className="muted">Показания принимаются только по объекту с действующим договором.</p>
            {error && <div className="error">{error}</div>}
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={closeSheet}>Отмена</button>
              <button type="submit" disabled={busy || (previewConsumption != null && previewConsumption < 0)}>Отправить</button>
            </div>
          </form>
        </Sheet>
      )}
    </>
  );
}

export default function PropertyDetailPage() {
  return (
    <RequireAuth>
      <PropertyDetailInner />
    </RequireAuth>
  );
}
