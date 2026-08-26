'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  FileText,
  Gauge,
  History,
  Pencil,
  Wallet,
} from 'lucide-react';
import {
  AddressFields,
  AddressFieldsValue,
  EMPTY_ADDRESS_FIELDS,
} from '@/components/AddressFields';
import { AppShell } from '@/components/AppShell';
import { LeaseStatusPill } from '@/components/LeaseStatusPill';
import { List, Row } from '@/components/List';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { Section } from '@/components/Section';
import { Segmented } from '@/components/Segmented';
import { StatusPill } from '@/components/StatusPill';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import {
  getProperty,
  getPropertyLeaseHistory,
  Property,
  PropertyLeaseHistoryEntry,
  updateProperty,
} from '@/lib/properties';
import { addElevenMonths, createLease, Lease, listLeases } from '@/lib/leases';
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

type SheetKind =
  | null
  | 'property'
  | 'service'
  | 'meter'
  | 'reading'
  | 'editMeter'
  | 'lease';

type PendingReading = {
  consumption: number;
  cost: number;
  previousValue: number;
  warning: string | null;
  photo: File;
};

function PropertyDetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [leaseHistory, setLeaseHistory] =
    useState<PropertyLeaseHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);

  const [editAddress, setEditAddress] =
    useState<AddressFieldsValue>(EMPTY_ADDRESS_FIELDS);
  const [editPropertyType, setEditPropertyType] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editDescription, setEditDescription] = useState('');

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
  const [readPending, setReadPending] = useState<PendingReading | null>(null);
  const [readPendingChanged, setReadPendingChanged] = useState(false);
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
      const [p, s, m, l, history] = await Promise.all([
        getProperty(id),
        listServices(id),
        listMeters(id),
        listLeases(),
        getPropertyLeaseHistory(id),
      ]);
      setProperty(p);
      setServices(s);
      setMeters(m);
      setLeases(l.filter((x) => x.propertyId === id));
      setLeaseHistory(history);
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
    if (sheet === 'reading') {
      setReadPending(null);
      setReadPendingChanged(false);
      setReadValue('');
      if (readFileRef.current) readFileRef.current.value = '';
    }
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
    setReadPending(null);
    setReadPendingChanged(false);
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
      if (r.requiresConfirmation) {
        setReadPending({ ...r, photo });
        setReadPendingChanged(false);
        return;
      }
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

  async function onConfirmReading() {
    if (!readPending || !readMeterId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await submitReading(
        readMeterId,
        Number(readValue),
        readPending.photo,
        true,
        readPending.previousValue,
      );
      if (r.requiresConfirmation) {
        setReadPending({ ...r, photo: readPending.photo });
        setReadPendingChanged(true);
        return;
      }
      setReadMsg(
        `Принято: расход ${r.consumption}, начислено ${formatMoney(r.cost)} ₽` +
          (r.warning ? ` — ${r.warning}` : ''),
      );
      closeSheet();
      await load();
    } catch (err) {
      setReadPending(null);
      setReadPendingChanged(false);
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

  function openPropertyEdit() {
    if (!property) return;
    setEditAddress({
      city: property.city ?? '',
      street: property.street ?? '',
      house: property.house ?? '',
      building: property.building ?? '',
      floor: property.floor ?? '',
      apartment: property.apartment ?? '',
      cadastralNumber: property.cadastralNumber ?? '',
    });
    setEditPropertyType(property.propertyType);
    setEditArea(property.areaSqm != null ? String(property.areaSqm) : '');
    setEditDescription(property.description ?? '');
    setError(null);
    setSheet('property');
  }

  async function onSaveProperty(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const optionalValue = (value: string): string | null =>
      value.trim() === '' ? null : value;
    try {
      await updateProperty(id, {
        city: editAddress.city,
        street: editAddress.street,
        house: editAddress.house,
        building: optionalValue(editAddress.building),
        floor: optionalValue(editAddress.floor),
        apartment: optionalValue(editAddress.apartment),
        cadastralNumber: optionalValue(editAddress.cadastralNumber),
        propertyType: editPropertyType,
        areaSqm: editArea ? Number(editArea) : undefined,
        description: editDescription,
      });
      closeSheet();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  const addBtn = (kind: SheetKind) => (
    <Button variant="link" size="sm" onClick={() => setSheet(kind)}>
      Добавить
    </Button>
  );

  const errorBox = error && !sheet && (
    <p
      role="alert"
      className="mb-4 flex items-center gap-2 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
    >
      <AlertTriangle aria-hidden className="size-4 shrink-0" />
      {error}
    </p>
  );

  const openLeases = leases.filter((lease) => lease.status !== 'terminated');

  const sheetError = error && sheet && (
    <p className="flex items-center gap-2 text-sm text-danger">
      <AlertTriangle aria-hidden className="size-4 shrink-0" />
      {error}
    </p>
  );

  return (
    <AppShell>
      {!property ? (
        <p className="text-content-muted">Загрузка…</p>
      ) : (
        <>
          <PageHeader
            back="/properties"
            backLabel="Аренда"
            title={property.address}
            subtitle={`${property.propertyType}${property.areaSqm ? ` · ${property.areaSqm} м²` : ''} · ${property.timezone}${property.cadastralNumber ? ` · Кадастровый № ${property.cadastralNumber}` : ''}`}
            action={
              <Button variant="secondary" onClick={openPropertyEdit}>
                <Pencil aria-hidden /> Редактировать
              </Button>
            }
          />
          {errorBox}
          {readMsg && (
            <p className="mb-4 rounded-md bg-sand-200/60 px-4 py-3 text-sm text-content-secondary">
              {readMsg}
            </p>
          )}

          <div className="lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-10">
            <div>
              <Section
                title="Договор"
                className="mt-0"
                action={openLeases.length === 0 ? addBtn('lease') : undefined}
              >
                {openLeases.length === 0 ? (
                  <p className="rounded-md border border-line px-5 py-6 text-center text-content-muted">
                    Действующего договора сейчас нет.
                  </p>
                ) : (
                  <List>
                    {openLeases.map((l) => (
                      <Row
                        key={l.id}
                        icon={FileText}
                        title={`Договор · ${formatMoney(l.rentAmount)} ₽/мес`}
                        subtitle={`${formatDate(l.startDate)} — ${formatDate(l.endDate)}`}
                        value={<LeaseStatusPill status={l.status} />}
                        href={`/leases/${l.id}`}
                      />
                    ))}
                  </List>
                )}
              </Section>

              <Section title="История арендаторов">
                {leaseHistory.length === 0 ? (
                  <p className="rounded-md border border-line px-5 py-6 text-center text-content-muted">
                    Завершённых аренд пока нет.
                  </p>
                ) : (
                  <List>
                    {leaseHistory.map((entry) => {
                      const payments = paymentHistoryLabel(entry);
                      return (
                        <Row
                          key={entry.leaseId}
                          icon={History}
                          title={entry.tenantEmail ?? 'Арендатор не привязан'}
                          subtitle={
                            <span className="space-y-1">
                              <span className="block">
                                {formatDate(entry.startDate)} —{' '}
                                {formatDate(entry.effectiveEndDate ?? entry.endDate)}
                              </span>
                              <span className="block">
                                {formatMoney(entry.monthlyRent)} ₽/мес ·{' '}
                                {entry.payments.finalBills === 0
                                  ? 'без финальных счетов'
                                  : `${entry.payments.paidOnTime} вовремя · ${entry.payments.paidLate} позже · ${entry.payments.unpaid} не оплачено`}
                              </span>
                            </span>
                          }
                          value={
                            <StatusPill tone={payments.tone}>
                              {payments.label}
                            </StatusPill>
                          }
                          href={`/leases/${entry.leaseId}`}
                        />
                      );
                    })}
                  </List>
                )}
              </Section>
            </div>

            <div className="mt-8 lg:mt-0">
              <Section title="Счётчики" className="mt-0" action={addBtn('meter')}>
                {meters.length === 0 ? (
                  <p className="rounded-md border border-line px-5 py-6 text-center text-content-muted">
                    Счётчиков пока нет.
                  </p>
                ) : (
                  <List>
                    {meters.map((m) => (
                      <Row
                        key={m.id}
                        icon={Gauge}
                        title={m.name}
                        subtitle={
                          `${METER_TYPE_LABEL[m.meterType]}` +
                          (m.serialNumber ? ` · № ${m.serialNumber}` : '') +
                          ` · ${m.lastReadingValue} ${METER_UNIT_LABEL[m.meterType]}`
                        }
                        value={
                          <span className="flex flex-col items-end gap-1">
                            <span className="font-semibold [font-variant-numeric:tabular-nums]">
                              {formatMoney(m.tariff)} ₽
                            </span>
                            {!m.isActive && <StatusPill tone="neutral">Отключён</StatusPill>}
                          </span>
                        }
                        onClick={() => openEditMeter(m)}
                      />
                    ))}
                  </List>
                )}
                {meters.some((m) => m.isActive) && (
                  <Button variant="secondary" className="mt-3" onClick={openReadingSheet}>
                    Подать показание
                  </Button>
                )}
              </Section>

              <Section title="Услуги" action={addBtn('service')}>
                {services.length === 0 ? (
                  <p className="rounded-md border border-line px-5 py-6 text-center text-content-muted">
                    Услуг пока нет.
                  </p>
                ) : (
                  <List>
                    {services.map((s) => (
                      <Row
                        key={s.id}
                        icon={Wallet}
                        title={s.name}
                        subtitle={
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span>{SERVICE_TYPE_LABEL[s.serviceType]}</span>
                            {s.sourceRequestId && <span>· из заявки</span>}
                            {s.serviceType === 'one_time' && (
                              <StatusPill tone={s.billedAt ? 'success' : 'warn'}>
                                {s.billedAt
                                  ? `Выставлено ${new Date(s.billedAt).toLocaleDateString('ru-RU')}`
                                  : 'Ждёт выставления'}
                              </StatusPill>
                            )}
                          </span>
                        }
                        value={
                          <span className="font-bold text-terracotta-500 [font-variant-numeric:tabular-nums]">
                            {formatMoney(s.price)} ₽
                          </span>
                        }
                      />
                    ))}
                  </List>
                )}
              </Section>
            </div>
          </div>
        </>
      )}

      <Dialog open={sheet === 'property'} onOpenChange={(open) => !open && closeSheet()}>
        <DialogContent title="Редактировать объект">
          <form onSubmit={onSaveProperty} className="space-y-4">
            <AddressFields
              idPrefix="edit-address"
              value={editAddress}
              onChange={setEditAddress}
              legacyAddress={
                property && !property.city && !property.street && !property.house
                  ? property.address
                  : undefined
              }
            />
            <div className="space-y-1.5">
              <Label htmlFor="edit-property-type">Тип объекта</Label>
              <Input
                id="edit-property-type"
                value={editPropertyType}
                onChange={(e) => setEditPropertyType(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-property-area">Площадь, м²</Label>
              <Input
                id="edit-property-area"
                type="number"
                min={0}
                step="0.01"
                value={editArea}
                onChange={(e) => setEditArea(e.target.value)}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-property-description">Описание</Label>
              <Textarea
                id="edit-property-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            {sheetError}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={closeSheet}>
                Отмена
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sheet === 'lease'} onOpenChange={(open) => !open && closeSheet()}>
        <DialogContent title="Новый договор">
          <form onSubmit={onCreateLease} className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="min-w-36 flex-1 space-y-1.5">
                <Label htmlFor="l-start">Начало</Label>
                <Input
                  id="l-start"
                  type="date"
                  value={lStartDate}
                  onChange={(e) => {
                    setLStartDate(e.target.value);
                    setLEndDate(addElevenMonths(e.target.value));
                  }}
                  required
                />
              </div>
              <div className="min-w-36 flex-1 space-y-1.5">
                <Label htmlFor="l-end">Окончание</Label>
                <Input
                  id="l-end"
                  type="date"
                  value={lEndDate}
                  onChange={(e) => setLEndDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-rent">Аренда, ₽/мес</Label>
              <Input
                id="l-rent"
                type="number"
                value={lRentAmount}
                onChange={(e) => setLRentAmount(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="min-w-28 flex-1 space-y-1.5">
                <Label htmlFor="l-deposit">Депозит, ₽</Label>
                <Input
                  id="l-deposit"
                  type="number"
                  value={lDepositAmount}
                  onChange={(e) => setLDepositAmount(e.target.value)}
                />
              </div>
              <div className="min-w-28 flex-1 space-y-1.5">
                <Label htmlFor="l-day">День оплаты</Label>
                <Input
                  id="l-day"
                  type="number"
                  min={1}
                  max={28}
                  value={lPaymentDay}
                  onChange={(e) => setLPaymentDay(e.target.value)}
                />
              </div>
              <div className="min-w-28 flex-1 space-y-1.5">
                <Label htmlFor="l-penalty">Пеня, %/день</Label>
                <Input
                  id="l-penalty"
                  type="number"
                  step="0.01"
                  min={0}
                  value={lPenalty}
                  onChange={(e) => setLPenalty(e.target.value)}
                />
              </div>
            </div>
            {sheetError}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={closeSheet}>
                Отмена
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Создание…' : 'Создать черновик'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sheet === 'service'} onOpenChange={(open) => !open && closeSheet()}>
        <DialogContent title="Новая услуга">
          <form onSubmit={onAddService} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="svc-name">Название</Label>
              <Input
                id="svc-name"
                value={svcName}
                onChange={(e) => setSvcName(e.target.value)}
                placeholder="Интернет, уборка…"
                required
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="min-w-36 flex-1 space-y-1.5">
                <Label htmlFor="svc-price">Стоимость, ₽</Label>
                <Input
                  id="svc-price"
                  type="number"
                  value={svcPrice}
                  onChange={(e) => setSvcPrice(e.target.value)}
                  required
                />
              </div>
              <div className="min-w-36 flex-1 space-y-1.5">
                <Label htmlFor="svc-type">Тип</Label>
                <Select
                  id="svc-type"
                  value={svcType}
                  onChange={(e) => setSvcType(e.target.value as ServiceType)}
                >
                  <option value="monthly">Ежемесячная</option>
                  <option value="one_time">Разовая</option>
                </Select>
              </div>
            </div>
            {sheetError}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={closeSheet}>
                Отмена
              </Button>
              <Button type="submit" disabled={busy}>
                Добавить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sheet === 'meter'} onOpenChange={(open) => !open && closeSheet()}>
        <DialogContent title="Новый счётчик">
          <form onSubmit={onAddMeter} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="m-name">Название</Label>
              <Input
                id="m-name"
                placeholder="напр. ГВС, Электро день"
                value={mName}
                onChange={(e) => setMName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-serial">Серийный номер</Label>
              <Input
                id="m-serial"
                placeholder="необязательно"
                value={mSerialNumber}
                onChange={(e) => setMSerialNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-type">Тип счётчика</Label>
              <Select
                id="m-type"
                value={mType}
                onChange={(e) => onMeterTypeChange(e.target.value as MeterType)}
              >
                <option value="electricity">Электричество</option>
                <option value="water">Вода</option>
                <option value="gas">Газ</option>
                <option value="heating">Отопление</option>
              </Select>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="min-w-40 flex-1 space-y-1.5">
                <Label htmlFor="m-initial">
                  Начальное показание, {METER_UNIT_LABEL[mType]}
                </Label>
                <Input
                  id="m-initial"
                  type="number"
                  step="0.001"
                  min={0}
                  value={mInitialReading}
                  onChange={(e) => setMInitialReading(e.target.value)}
                  required
                />
              </div>
              <div className="min-w-40 flex-1 space-y-1.5">
                <Label htmlFor="m-tariff">Тариф, ₽/{METER_UNIT_LABEL[mType]}</Label>
                <Input
                  id="m-tariff"
                  type="number"
                  step="0.0001"
                  value={mTariff}
                  onChange={(e) => setMTariff(e.target.value)}
                  required
                />
              </div>
            </div>
            <p className="max-w-prose text-sm text-content-muted">
              Значение на приборе на момент постановки на учёт — от него считается расход
              первого показания.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="m-calibration">Дата поверки (необязательно)</Label>
              <Input
                id="m-calibration"
                type="date"
                value={mCalibrationDueDate}
                onChange={(e) => setMCalibrationDueDate(e.target.value)}
              />
            </div>
            {sheetError}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={closeSheet}>
                Отмена
              </Button>
              <Button type="submit" disabled={busy}>
                Добавить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sheet === 'editMeter'} onOpenChange={(open) => !open && closeSheet()}>
        <DialogContent title="Счётчик">
          <form onSubmit={onSaveMeterEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="e-name">Название</Label>
              <Input
                id="e-name"
                value={eName}
                onChange={(e) => setEName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="min-w-40 flex-1 space-y-1.5">
                <Label htmlFor="e-serial">Серийный номер</Label>
                <Input
                  id="e-serial"
                  placeholder="необязательно"
                  value={eSerialNumber}
                  onChange={(e) => setESerialNumber(e.target.value)}
                />
              </div>
              <div className="min-w-40 flex-1 space-y-1.5">
                <Label htmlFor="e-tariff">Тариф</Label>
                <Input
                  id="e-tariff"
                  type="number"
                  step="0.0001"
                  value={eTariff}
                  onChange={(e) => setETariff(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <div>
                <Segmented<'active' | 'off'>
                  ariaLabel="Статус счётчика"
                  options={[
                    { value: 'active', label: 'Активен' },
                    { value: 'off', label: 'Отключён' },
                  ]}
                  value={eActive ? 'active' : 'off'}
                  onChange={(v) => setEActive(v === 'active')}
                />
              </div>
            </div>
            {!eActive && (
              <p className="max-w-prose text-sm text-content-muted">
                Отключённый счётчик не будет принимать новые показания.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="e-calibration">Дата поверки (необязательно)</Label>
              <Input
                id="e-calibration"
                type="date"
                value={eCalibrationDueDate}
                onChange={(e) => setECalibrationDueDate(e.target.value)}
              />
            </div>
            {sheetError}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={closeSheet}>
                Отмена
              </Button>
              <Button type="submit" disabled={busy}>
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sheet === 'reading'} onOpenChange={(open) => !open && closeSheet()}>
        <DialogContent title="Показание счётчика">
          {readPending ? (
            <div className="space-y-4">
              <p
                className={`flex items-center gap-2 rounded-md px-4 py-3 text-sm ${
                  readPending.warning
                    ? 'border border-warn-line bg-warn-weak text-warn'
                    : 'border border-line bg-surface-icon text-content-secondary'
                }`}
              >
                <AlertTriangle aria-hidden className="size-4 shrink-0" />
                {readPending.warning === null
                  ? 'Показания изменились — проверьте расход'
                  : readPendingChanged
                    ? 'Показания изменились, проверьте ещё раз'
                    : readPending.warning}
              </p>
              <dl className="rounded-md border border-line px-4 py-3 text-sm">
                <div className="flex justify-between gap-4 py-1">
                  <dt className="text-content-muted">Показание</dt>
                  <dd className="font-semibold text-content">
                    {readValue}
                    {selectedMeter ? ` ${METER_UNIT_LABEL[selectedMeter.meterType]}` : ''}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-1">
                  <dt className="text-content-muted">Расход</dt>
                  <dd className="font-semibold text-content">
                    {readPending.consumption}
                    {selectedMeter ? ` ${METER_UNIT_LABEL[selectedMeter.meterType]}` : ''}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-1">
                  <dt className="text-content-muted">Сумма</dt>
                  <dd className="font-bold text-terracotta-500">
                    {formatMoney(readPending.cost)} ₽
                  </dd>
                </div>
              </dl>
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setReadPending(null);
                    setReadPendingChanged(false);
                  }}
                >
                  Исправить
                </Button>
                <Button type="button" disabled={busy} onClick={() => void onConfirmReading()}>
                  {busy ? 'Сохранение…' : 'Всё верно, сохранить'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={onSubmitReading} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="r-meter">Счётчик</Label>
              <Select
                id="r-meter"
                value={readMeterId}
                onChange={(e) => selectMeterForReading(e.target.value)}
              >
                {meters
                  .filter((m) => m.isActive)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({METER_TYPE_LABEL[m.meterType]})
                    </option>
                  ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="r-value">
                Новое показание
                {selectedMeter ? `, ${METER_UNIT_LABEL[selectedMeter.meterType]}` : ''}
              </Label>
              <Input
                id="r-value"
                type="number"
                step="0.001"
                value={readValue}
                invalid={previewConsumption != null && previewConsumption < 0}
                onChange={(e) => setReadValue(e.target.value)}
                required
              />
              {selectedMeter && (
                <p className="text-sm text-content-muted">
                  Текущее: {selectedMeter.lastReadingValue}{' '}
                  {METER_UNIT_LABEL[selectedMeter.meterType]}
                </p>
              )}
              {previewConsumption != null && previewConsumption < 0 && (
                <p className="flex items-center gap-1.5 text-sm text-danger">
                  <AlertTriangle aria-hidden className="size-4 shrink-0" />
                  Новое показание не может быть меньше текущего
                </p>
              )}
            </div>

            {/* Предпросмотр расхода и суммы: пользователь видит цену
                своего ввода до отправки, а не после начисления. */}
            {previewConsumption != null && previewConsumption >= 0 && (
              <p className="rounded-md bg-sand-200/60 px-4 py-3 text-sm text-content-secondary">
                Расход {previewConsumption.toFixed(3)}{' '}
                {selectedMeter ? METER_UNIT_LABEL[selectedMeter.meterType] : ''} · начислится{' '}
                <span className="font-bold text-terracotta-500">
                  {previewCost != null ? formatMoney(previewCost) : ''} ₽
                </span>
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="r-photo">Фото счётчика</Label>
              <input
                id="r-photo"
                ref={readFileRef}
                type="file"
                accept="image/jpeg,image/png"
                required
                className="w-full text-sm text-content-secondary file:mr-3 file:rounded-pill file:border file:border-line-strong file:bg-transparent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-content"
              />
            </div>

            <p className="max-w-prose text-sm text-content-muted">
              Показания принимаются только по объекту с действующим договором.
            </p>
            {sheetError}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={closeSheet}>
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={busy || (previewConsumption != null && previewConsumption < 0)}
              >
                Отправить
              </Button>
            </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export default function PropertyDetailPage() {
  return (
    <RequireAuth>
      <PropertyDetailInner />
    </RequireAuth>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

function paymentHistoryLabel(entry: PropertyLeaseHistoryEntry): {
  tone: 'success' | 'warn' | 'danger' | 'neutral';
  label: string;
} {
  const { finalBills, paidLate, unpaid } = entry.payments;
  if (finalBills === 0) return { tone: 'neutral', label: 'Нет счетов' };
  if (unpaid > 0) return { tone: 'danger', label: `${unpaid} не оплачено` };
  if (paidLate > 0) return { tone: 'warn', label: `${paidLate} с задержкой` };
  return { tone: 'success', label: 'Всё вовремя' };
}
