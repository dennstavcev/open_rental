// Единый формат отображения денежных сумм — разделитель разрядов
// (неразрывный пробел, локаль ru), максимум 2 знака после запятой,
// без хвостовых нулей у целых значений.
export function formatMoney(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  return n.toLocaleString('ru', { maximumFractionDigits: 2 });
}

// Показание для буфера обмена: голое число, точка разделителем, без
// хвостовых нулей — его вставляют в поле личного кабинета УК, и любой
// лишний символ придётся стирать руками (ADR-0024).
export function formatReadingForCopy(value: string | number): string {
  const [integer, fraction] = String(value).split('.');
  if (fraction === undefined) {
    return integer;
  }
  const trimmed = fraction.replace(/0+$/, '');
  return trimmed ? `${integer}.${trimmed}` : integer;
}
