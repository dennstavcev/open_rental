'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Package, Plus } from 'lucide-react';
import { List, Row } from './List';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { ApiError } from '@/lib/api';
import {
  createInventoryItem,
  deleteInventoryItem,
  InventoryItemInput,
  InventoryReturnStatus,
  LeaseInventoryItem,
  listInventoryItems,
  RETURN_STATUS_LABEL,
  updateInventoryItem,
  updateInventoryReturnState,
} from '@/lib/leases';

function ReturnItemEditor({
  item,
  editable,
  onSaved,
}: {
  item: LeaseInventoryItem;
  editable: boolean;
  onSaved: () => Promise<void>;
}) {
  const [returnStatus, setReturnStatus] = useState<InventoryReturnStatus | ''>(
    item.returnStatus ?? '',
  );
  const [returnNote, setReturnNote] = useState(item.returnNote ?? '');
  const [damageAmount, setDamageAmount] = useState(item.damageAmount ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReturnStatus(item.returnStatus ?? '');
    setReturnNote(item.returnNote ?? '');
    setDamageAmount(item.damageAmount ?? '');
  }, [item]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!returnStatus) return;
    setBusy(true);
    setError(null);
    try {
      await updateInventoryReturnState(item.leaseId, item.id, {
        returnStatus,
        returnNote,
        damageAmount:
          returnStatus === 'ok' || damageAmount.trim() === ''
            ? null
            : Number(damageAmount),
      });
      await onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Ошибка сохранения состояния',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-md border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-content">{item.type}</p>
          <p className="text-sm text-content-muted">
            {[item.brand, item.model].filter(Boolean).join(' ') || 'Без марки и модели'}
            {' · '}{item.quantity} шт.
          </p>
        </div>
        {item.returnStatus && (
          <span className="text-sm font-semibold text-content-secondary">
            {RETURN_STATUS_LABEL[item.returnStatus]}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`return-status-${item.id}`}>Состояние</Label>
          <Select
            id={`return-status-${item.id}`}
            value={returnStatus}
            onChange={(e) =>
              setReturnStatus(e.target.value as InventoryReturnStatus | '')
            }
            disabled={!editable || busy}
            required
          >
            <option value="">Не выбрано</option>
            {Object.entries(RETURN_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {returnStatus !== 'ok' && (
          <div className="space-y-1.5">
            <Label htmlFor={`damage-${item.id}`}>Сумма ущерба, ₽</Label>
            <Input
              id={`damage-${item.id}`}
              type="number"
              min={0}
              max={9999999.99}
              step="0.01"
              value={damageAmount}
              onChange={(e) => setDamageAmount(e.target.value)}
              disabled={!editable || busy}
              placeholder="0"
            />
          </div>
        )}

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={`return-note-${item.id}`}>Примечание</Label>
          <Input
            id={`return-note-${item.id}`}
            value={returnNote}
            onChange={(e) => setReturnNote(e.target.value)}
            disabled={!editable || busy}
            maxLength={300}
            placeholder="Что повреждено или где находится предмет"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-danger">
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}
      {editable && (
        <Button type="submit" size="sm" className="mt-4" disabled={busy || !returnStatus}>
          {busy ? 'Сохранение…' : 'Сохранить состояние'}
        </Button>
      )}
    </form>
  );
}

// Опись имущества, передаваемого вместе с помещением (ADR-0018) — из неё
// рендерится Приложение №1 «Акт приёма-передачи имущества». Один и тот же
// редактор используется в мастере сдачи объекта и на карточке договора:
// правка доступна собственнику, пока договор — черновик, дальше список
// доступен обеим сторонам только на чтение.
export function InventoryEditor({
  leaseId,
  editable,
  onCountChange,
  returnMode = false,
  onChanged,
}: {
  leaseId: string;
  editable: boolean;
  onCountChange?: (count: number) => void;
  returnMode?: boolean;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<LeaseInventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<LeaseInventoryItem | 'new' | null>(null);

  const [type, setType] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [quantity, setQuantity] = useState('1');

  // Колбэк держим в ref: иначе инлайновая стрелка от родителя меняла бы
  // идентичность load на каждый рендер и эффект зацикливался бы.
  const notifyCount = useRef(onCountChange);
  notifyCount.current = onCountChange;
  const notifyChanged = useRef(onChanged);
  notifyChanged.current = onChanged;

  const load = useCallback(async () => {
    try {
      const list = await listInventoryItems(leaseId);
      setItems(list);
      notifyCount.current?.(list.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки описи');
    }
  }, [leaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setType('');
    setBrand('');
    setModel('');
    setQuantity('1');
    setEditing('new');
  }

  function openEdit(item: LeaseInventoryItem) {
    if (!editable) return;
    setType(item.type);
    setBrand(item.brand ?? '');
    setModel(item.model ?? '');
    setQuantity(String(item.quantity));
    setEditing(item);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Пустые бренд/модель не отправляем: бэкенд валидирует их как непустые
    // строки, если поле присутствует.
    const input: InventoryItemInput = {
      type,
      quantity: Number(quantity) || 1,
      ...(brand.trim() ? { brand: brand.trim() } : {}),
      ...(model.trim() ? { model: model.trim() } : {}),
    };
    try {
      if (editing === 'new') {
        await createInventoryItem(leaseId, input);
      } else if (editing) {
        await updateInventoryItem(leaseId, editing.id, input);
      }
      setEditing(null);
      await load();
      notifyChanged.current?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!editing || editing === 'new') return;
    setBusy(true);
    setError(null);
    try {
      await deleteInventoryItem(leaseId, editing.id);
      setEditing(null);
      await load();
      notifyChanged.current?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 flex items-center gap-2 text-sm text-danger">
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-md border border-line px-5 py-6 text-center text-base text-content-muted">
          {returnMode
            ? 'Опись имущества не заполнялась — акт можно отправить без позиций.'
            : editable
            ? 'Опись пуста — добавьте технику и мебель, которые передаёте вместе с помещением.'
            : 'Опись имущества не заполнена.'}
        </p>
      ) : returnMode ? (
        <div className="space-y-3">
          {items.map((item) => (
            <ReturnItemEditor
              key={item.id}
              item={item}
              editable={editable}
              onSaved={async () => {
                await load();
                notifyChanged.current?.();
              }}
            />
          ))}
        </div>
      ) : (
        <List>
          {items.map((item) => (
            <Row
              key={item.id}
              icon={Package}
              title={item.type}
              subtitle={
                [item.brand, item.model].filter(Boolean).join(' ') || 'Без марки и модели'
              }
              value={
                <span className="text-base font-semibold [font-variant-numeric:tabular-nums]">
                  {item.quantity} шт.
                </span>
              }
              onClick={editable ? () => openEdit(item) : undefined}
            />
          ))}
        </List>
      )}

      {editable && !returnMode && (
        <Button variant="secondary" block className="mt-3" onClick={openNew}>
          <Plus aria-hidden /> Добавить позицию
        </Button>
      )}

      <Dialog
        open={!returnMode && editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        {editing && (
          <DialogContent title={editing === 'new' ? 'Позиция описи' : 'Изменить позицию'}>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="inv-type">Что передаётся</Label>
                <Input
                  id="inv-type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  placeholder="Холодильник"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-brand">Бренд (необязательно)</Label>
                <Input
                  id="inv-brand"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Bosch"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-model">Модель (необязательно)</Label>
                <Input
                  id="inv-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="KGN39"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-qty">Количество</Label>
                <Input
                  id="inv-qty"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              <DialogFooter>
                {editing !== 'new' && (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy}
                    onClick={onDelete}
                  >
                    Удалить позицию
                  </Button>
                )}
                <Button type="submit" disabled={busy}>
                  {busy ? 'Сохранение…' : 'Сохранить'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
