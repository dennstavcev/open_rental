'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
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

function PropertyDetailInner() {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [svcName, setSvcName] = useState('');
  const [svcPrice, setSvcPrice] = useState('');
  const [svcType, setSvcType] = useState<ServiceType>('monthly');
  const [showSvcForm, setShowSvcForm] = useState(false);

  const [mName, setMName] = useState('');
  const [mType, setMType] = useState<MeterType>('electricity');
  const [mTariff, setMTariff] = useState('');
  const [showMeterForm, setShowMeterForm] = useState(false);

  // Подача показания
  const [readMeterId, setReadMeterId] = useState('');
  const [readValue, setReadValue] = useState('');
  const readFileRef = useRef<HTMLInputElement>(null);
  const [readMsg, setReadMsg] = useState<string | null>(null);
  const [readErr, setReadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, s, m] = await Promise.all([
        getProperty(id),
        listServices(id),
        listMeters(id),
      ]);
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

  async function onAddService(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createService(id, { name: svcName, price: Number(svcPrice), serviceType: svcType });
      setSvcName('');
      setSvcPrice('');
      setShowSvcForm(false);
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
      setShowMeterForm(false);
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
    setReadMsg(null);
    setReadErr(null);
    try {
      const r = await submitReading(readMeterId, Number(readValue), photo);
      setReadMsg(
        `Принято: расход ${r.consumption}, начислено ${r.cost} ₽` +
          (r.warning ? ` — ${r.warning}` : ''),
      );
      setReadValue('');
      if (readFileRef.current) readFileRef.current.value = '';
    } catch (err) {
      setReadErr(err instanceof ApiError ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        {error && <div className="error">{error}</div>}
        {!property ? (
          <p className="muted">Загрузка…</p>
        ) : (
          <>
            <h1>{property.address}</h1>
            <div className="card muted">
              {property.propertyType}
              {property.areaSqm ? ` · ${property.areaSqm} м²` : ''} · {property.timezone}
            </div>

            <h2>Услуги</h2>
            {services.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Название</th>
                      <th className="num">Стоимость, ₽</th>
                      <th>Тип</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td className="num">{s.price}</td>
                        <td>
                          <span className="pill">{SERVICE_TYPE_LABEL[s.serviceType]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!showSvcForm ? (
              <div className="add-tile-wrap">
                <span className="add-tile-label">Услуги</span>
                <button
                  type="button"
                  className="add-tile"
                  onClick={() => setShowSvcForm(true)}
                  aria-label="Добавить услугу"
                >
                  +
                </button>
              </div>
            ) : (
              <form
                className="card"
                onSubmit={onAddService}
                style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
              >
                <div className="field" style={{ margin: 0 }}>
                  <label>Услуга</label>
                  <input value={svcName} onChange={(e) => setSvcName(e.target.value)} required />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Стоимость, ₽</label>
                  <input type="number" value={svcPrice} onChange={(e) => setSvcPrice(e.target.value)} required />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Тип</label>
                  <select value={svcType} onChange={(e) => setSvcType(e.target.value as ServiceType)}>
                    <option value="monthly">Ежемесячная</option>
                    <option value="one_time">Разовая</option>
                  </select>
                </div>
                <button type="submit" disabled={busy}>
                  Добавить услугу
                </button>
                <button type="button" className="secondary" onClick={() => setShowSvcForm(false)}>
                  Отмена
                </button>
              </form>
            )}

            <h2>Счётчики</h2>
            {meters.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Название</th>
                      <th>Тип</th>
                      <th className="num">Тариф</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meters.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <strong>{m.name}</strong>
                        </td>
                        <td>{METER_TYPE_LABEL[m.meterType]}</td>
                        <td className="num">{m.tariff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!showMeterForm ? (
              <div className="add-tile-wrap">
                <span className="add-tile-label">Счётчики</span>
                <button
                  type="button"
                  className="add-tile"
                  onClick={() => setShowMeterForm(true)}
                  aria-label="Добавить счётчик"
                >
                  +
                </button>
              </div>
            ) : (
              <form
                className="card"
                onSubmit={onAddMeter}
                style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
              >
                <div className="field" style={{ margin: 0 }}>
                  <label>Тип</label>
                  <select value={mType} onChange={(e) => setMType(e.target.value as MeterType)}>
                    <option value="electricity">Электричество</option>
                    <option value="water">Вода</option>
                    <option value="gas">Газ</option>
                    <option value="heating">Отопление</option>
                  </select>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Название</label>
                  <input placeholder="напр. ГВС" value={mName} onChange={(e) => setMName(e.target.value)} required />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Тариф</label>
                  <input type="number" step="0.0001" value={mTariff} onChange={(e) => setMTariff(e.target.value)} required />
                </div>
                <button type="submit" disabled={busy}>
                  Добавить счётчик
                </button>
                <button type="button" className="secondary" onClick={() => setShowMeterForm(false)}>
                  Отмена
                </button>
              </form>
            )}

            {meters.length > 0 && (
              <>
                <h2>Подать показание</h2>
                <p className="muted">
                  Доступно только по объекту с действующим договором.
                </p>
                <form
                  className="card"
                  onSubmit={onSubmitReading}
                  style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
                >
                  <div className="field" style={{ margin: 0 }}>
                    <label>Счётчик</label>
                    <select value={readMeterId} onChange={(e) => setReadMeterId(e.target.value)}>
                      {meters.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({METER_TYPE_LABEL[m.meterType]})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Показание</label>
                    <input type="number" step="0.001" value={readValue} onChange={(e) => setReadValue(e.target.value)} required />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Фото</label>
                    <input ref={readFileRef} type="file" accept="image/jpeg,image/png" required />
                  </div>
                  <button type="submit" disabled={busy}>
                    Отправить
                  </button>
                </form>
                {readMsg && <div className="muted">{readMsg}</div>}
                {readErr && <div className="error">{readErr}</div>}
              </>
            )}
          </>
        )}
      </div>
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
