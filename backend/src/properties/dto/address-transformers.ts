import { TransformFnParams } from 'class-transformer';

// Обязательное значение остаётся пустой строкой после trim, чтобы валидатор
// вернул пользователю ошибку, а не принял его как отсутствующее поле.
export const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

// Для необязательных полей пустая строка означает явную очистку значения.
export const trimToNull = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};
