'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { EmptyState, List, PageHeader, Row, Section, Sheet } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { getProperty, Property } from '@/lib/properties';
import {
  createMeter,
  createService,
  listMeters,
  listServices,
  Meter,
  METER_TYPE_LABEL,
  MeterType,
  Service,
  SERVICE_TYPE_LABEL,
  ServiceType,
  submitReading,
} from '@/lib/catalog';

type SheetKind = null | 'service' | 'meter' | 'reading';

function PropertyDetailInner() {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);

  const [svcName, setSvcName] = useState('');
  const [svcPrice, setSvcPrice] = useState('');
  const [svcType, setSvcType] = useState<ServiceType>('monthly');

  const [mName, setMName] = useState('');
  const [mType, setMType] = useState<MeterType>('electricity');
  const [mTariff, setMTariff] = useState('');

  const [readMeterId, setReadMeterId] = useState('');
  const [readValue, setReadValue] = useState('');
  const readFileRef = useRef<HTMLInputElement>(null);
  const [readMsg, setReadMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, s, m] = await Promise.all([getProperty(id), listServices(id), listMeters(id)]);
      setProperty(p);
      setServices(s);
      setMeters(m);
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
      await createMeter(id, { meterType: mType, name: mName, tariff: Number(mTariff) });
      setMName('');
      setMTariff('');
      closeSheet();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
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
        `Принято: расход ${r.consumption}, начислено ${r.cost} ₽` +
          (r.warning ? ` — ${r.warning}` : ''),
      );
      setReadValue('');
      if (readFileRef.current) readFileRef.current.value = '';
      closeSheet();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    } finally {
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
                      subtitle={METER_TYPE_LABEL[m.meterType]}
                      trail={`${m.tariff} ₽`}
                      chevron={false}
                    />
                  ))}
                </List>
              )}
              {meters.length > 0 && (
                <button className="secondary" style={{ width: '100%' }} onClick={() => setSheet('reading')}>
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
                      trail={`${s.price} ₽`}
                      chevron={false}
                    />
                  ))}
                </List>
              )}
            </Section>
          </>
        )}
      </div>

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
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Тип</label>
                <select value={mType} onChange={(e) => setMType(e.target.value as MeterType)}>
                  <option value="electricity">Электричество</option>
                  <option value="water">Вода</option>
                  <option value="gas">Газ</option>
                  <option value="heating">Отопление</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Тариф</label>
                <input type="number" step="0.0001" value={mTariff} onChange={(e) => setMTariff(e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label>Название</label>
              <input placeholder="напр. ГВС, Электро день" value={mName} onChange={(e) => setMName(e.target.value)} required />
            </div>
            {error && <div className="error">{error}</div>}
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={closeSheet}>Отмена</button>
              <button type="submit" disabled={busy}>Добавить</button>
            </div>
          </form>
        </Sheet>
      )}

      {sheet === 'reading' && (
        <Sheet title="Показание счётчика" onClose={closeSheet}>
          <form onSubmit={onSubmitReading}>
            <div className="field">
              <label>Счётчик</label>
              <select value={readMeterId} onChange={(e) => setReadMeterId(e.target.value)}>
                {meters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({METER_TYPE_LABEL[m.meterType]})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Текущее показание</label>
              <input type="number" step="0.001" value={readValue} onChange={(e) => setReadValue(e.target.value)} required />
            </div>
            <div className="field">
              <label>Фото счётчика</label>
              <input ref={readFileRef} type="file" accept="image/jpeg,image/png" required />
            </div>
            <p className="muted">Показания принимаются только по объекту с действующим договором.</p>
            {error && <div className="error">{error}</div>}
            <div className="sheet-actions">
              <button type="button" className="secondary" onClick={closeSheet}>Отмена</button>
              <button type="submit" disabled={busy}>Отправить</button>
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
