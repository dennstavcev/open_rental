'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { List, Row, Sheet } from './ui';
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
      {error && <div className="error">{error}</div>}
      {items.length === 0 ? (
        <div className="empty">
          {editable
            ? 'Опись пуста — добавьте технику и мебель, которые передаёте вместе с помещением.'
            : 'Опись имущества не заполнена.'}
        </div>
      ) : (
        <List>
          {items.map((item) => (
            <Row
              key={item.id}
              icon="inbox"
              title={item.type}
              subtitle={
                [item.brand, item.model].filter(Boolean).join(' ') || 'Без марки и модели'
              }
              trail={`${item.quantity} шт.`}
              onClick={editable ? () => openEdit(item) : undefined}
              chevron={editable}
            />
          ))}
        </List>
      )}

      {editable && (
        <button className="secondary" style={{ width: '100%' }} onClick={openNew}>
          + Добавить позицию
        </button>
      )}

      {editing && (
        <Sheet
          title={editing === 'new' ? 'Позиция описи' : 'Изменить позицию'}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={onSubmit}>
            <div className="field">
              <label>Что передаётся</label>
              <input
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="Холодильник"
                required
              />
            </div>
            <div className="field">
              <label>Бренд (необязательно)</label>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Bosch"
              />
            </div>
            <div className="field">
              <label>Модель (необязательно)</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="KGN39"
              />
            </div>
            <div className="field">
              <label>Количество</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <button type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
            {editing !== 'new' && (
              <button
                type="button"
                className="secondary"
                style={{ width: '100%', marginTop: 8 }}
                disabled={busy}
                onClick={onDelete}
              >
                Удалить позицию
              </button>
            )}
          </form>
        </Sheet>
      )}
    </>
  );
}
