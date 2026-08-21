'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Package, Plus } from 'lucide-react';
import { List, Row } from './List';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ApiError } from '@/lib/api';
import {
  createInventoryItem,
  deleteInventoryItem,
  InventoryItemInput,
  LeaseInventoryItem,
  listInventoryItems,
  updateInventoryItem,
} from '@/lib/leases';

// Опись имущества, передаваемого вместе с помещением (ADR-0018) — из неё
// рендерится Приложение №1 «Акт приёма-передачи имущества». Один и тот же
// редактор используется в мастере сдачи объекта и на карточке договора:
// правка доступна собственнику, пока договор — черновик, дальше список
// доступен обеим сторонам только на чтение.
export function InventoryEditor({
  leaseId,
  editable,
  onCountChange,
}: {
  leaseId: string;
  editable: boolean;
  onCountChange?: (count: number) => void;
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
          {editable
            ? 'Опись пуста — добавьте технику и мебель, которые передаёте вместе с помещением.'
            : 'Опись имущества не заполнена.'}
        </p>
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

      {editable && (
        <Button variant="secondary" block className="mt-3" onClick={openNew}>
          <Plus aria-hidden /> Добавить позицию
        </Button>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
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
