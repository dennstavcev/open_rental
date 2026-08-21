'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, FileText, Plus } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { LeaseStatusPill } from '@/components/LeaseStatusPill';
import { List, Row } from '@/components/List';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { Section } from '@/components/Section';
import { StatusPill } from '@/components/StatusPill';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { createProperty, listProperties, Property } from '@/lib/properties';
import { Lease, listLeases, STATUS_LABEL } from '@/lib/leases';
import { formatMoney } from '@/lib/format';

const PROPERTY_TYPES = ['Квартира', 'Комната', 'Дом', 'Апартаменты', 'Коммерческое'];

// Приоритет статуса для строки объекта, если по нему есть несколько
// договоров (история) — показываем самый «живой».
const STATUS_PRIORITY = { active: 0, sent: 1, draft: 2, terminated: 3 };

function PropertiesInner() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<Property[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState('Квартира');
  const [area, setArea] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [props, allLeases] = await Promise.all([listProperties(), listLeases()]);
      setItems(props);
      setLeases(allLeases);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  const leaseByProperty = useMemo(() => {
    const map: Record<string, Lease> = {};
    for (const l of leases) {
      const current = map[l.propertyId];
      if (!current || STATUS_PRIORITY[l.status] < STATUS_PRIORITY[current.status]) {
        map[l.propertyId] = l;
      }
    }
    return map;
  }, [leases]);

  const tenantLeases = useMemo(
    () => leases.filter((l) => l.tenantId === user?.id),
    [leases, user],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createProperty({
        address,
        propertyType,
        areaSqm: area ? Number(area) : undefined,
      });
      setAddress('');
      setArea('');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка создания');
    } finally {
      setBusy(false);
    }
  }

  const hasNothing = items.length === 0 && tenantLeases.length === 0;

  return (
    <AppShell>
      <PageHeader
        title="Аренда"
        subtitle="Объекты в собственности и договоры, где вы арендатор"
        action={
          items.length > 0 ? (
            <Button className="hidden lg:inline-flex" onClick={() => setShowForm(true)}>
              <Plus aria-hidden /> Добавить объект
            </Button>
          ) : undefined
        }
      />

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {loading ? (
        <List>
          {[0, 1, 2].map((i) => (
            <Row
              key={i}
              title={<Skeleton className="h-4 w-56" />}
              subtitle={<Skeleton className="mt-1 h-3 w-32" />}
            />
          ))}
        </List>
      ) : hasNothing ? (
        <EmptyState
          icon={Building2}
          title="Сдайте первый объект"
          text="Добавьте квартиру или помещение — с этого начинается работа арендодателя."
          action={
            <>
              <Button onClick={() => setShowForm(true)}>Добавить объект</Button>
              <Button asChild variant="secondary">
                <Link href="/onboarding">Мастер настройки</Link>
              </Button>
            </>
          }
        />
      ) : (
        <>
          {items.length > 0 && (
            <>
              {/* Десктоп — настоящая таблица: адрес, тип, площадь и статус
                  сравниваются по столбцам, а не выуживаются из карточек. */}
              <div className="hidden lg:block">
                <Table>
                  <THead>
                    <TR>
                      <TH>Адрес</TH>
                      <TH>Тип</TH>
                      <TH numeric>Площадь</TH>
                      <TH numeric>Аренда</TH>
                      <TH>Статус</TH>
                    </TR>
                  </THead>
                  <tbody>
                    {items.map((p) => {
                      const lease = leaseByProperty[p.id];
                      return (
                        <TR
                          key={p.id}
                          className="cursor-pointer"
                          onClick={() => router.push(`/properties/${p.id}`)}
                        >
                          <TD>
                            <Link
                              href={`/properties/${p.id}`}
                              className="font-semibold text-content underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            >
                              {p.address}
                            </Link>
                          </TD>
                          <TD className="text-content-secondary">{p.propertyType}</TD>
                          <TD numeric className="text-content-secondary">
                            {p.areaSqm ? `${p.areaSqm} м²` : '—'}
                          </TD>
                          <TD numeric>
                            {lease ? (
                              <span className="font-bold text-terracotta-500">
                                {formatMoney(lease.rentAmount)} ₽/мес
                              </span>
                            ) : (
                              '—'
                            )}
                          </TD>
                          <TD>
                            {lease ? (
                              <LeaseStatusPill status={lease.status} />
                            ) : (
                              <StatusPill tone="neutral">Без договора</StatusPill>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              </div>

              {/* Мобильный — те же данные строками-карточками. */}
              <List className="lg:hidden">
                {items.map((p) => {
                  const lease = leaseByProperty[p.id];
                  return (
                    <Row
                      key={p.id}
                      icon={Building2}
                      title={p.address}
                      subtitle={`${p.propertyType}${p.areaSqm ? ` · ${p.areaSqm} м²` : ''}`}
                      value={
                        <span className="flex flex-col items-end gap-1">
                          {lease && (
                            <span className="font-bold text-terracotta-500 [font-variant-numeric:tabular-nums]">
                              {formatMoney(lease.rentAmount)} ₽
                            </span>
                          )}
                          {lease ? (
                            <LeaseStatusPill status={lease.status} />
                          ) : (
                            <StatusPill tone="neutral">Без договора</StatusPill>
                          )}
                        </span>
                      }
                      href={`/properties/${p.id}`}
                    />
                  );
                })}
              </List>
            </>
          )}

          {tenantLeases.length > 0 && (
            <Section title="Договоры, где вы арендатор">
              <List>
                {tenantLeases.map((l) => (
                  <Row
                    key={l.id}
                    icon={FileText}
                    title={`Договор · ${formatMoney(l.rentAmount)} ₽/мес`}
                    subtitle={`${l.startDate.slice(0, 10)} — ${l.endDate.slice(0, 10)}`}
                    value={<LeaseStatusPill status={l.status} />}
                    href={`/leases/${l.id}`}
                  />
                ))}
              </List>
            </Section>
          )}
        </>
      )}

      {items.length > 0 && <Fab label="Добавить объект" onClick={() => setShowForm(true)} />}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent title="Новый объект">
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="prop-address">Адрес</Label>
              <Input
                id="prop-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Город, улица, дом, квартира"
                required
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="min-w-40 flex-1 space-y-1.5">
                <Label htmlFor="prop-type">Тип</Label>
                <Select
                  id="prop-type"
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value)}
                >
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-40 flex-1 space-y-1.5">
                <Label htmlFor="prop-area">Площадь, м²</Label>
                <Input
                  id="prop-area"
                  type="number"
                  step="0.01"
                  min={0}
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="—"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Сохранение…' : 'Добавить'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export default function PropertiesPage() {
  return (
    <RequireAuth>
      <PropertiesInner />
    </RequireAuth>
  );
}
