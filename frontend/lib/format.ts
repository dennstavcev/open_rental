// Единый формат отображения денежных сумм — разделитель разрядов
// (неразрывный пробел, локаль ru), максимум 2 знака после запятой,
// без хвостовых нулей у целых значений.
export function formatMoney(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  return n.toLocaleString('ru', { maximumFractionDigits: 2 });
}
