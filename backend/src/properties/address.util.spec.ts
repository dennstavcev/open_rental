import { formatPropertyAddress } from './address.util';

describe('formatPropertyAddress', () => {
  it('собирает полный адрес с префиксами в заданном порядке', () => {
    expect(
      formatPropertyAddress({
        city: 'Иркутск',
        street: 'Зверева',
        house: '9Б',
        building: '2',
        floor: '3',
        apartment: '15',
      }),
    ).toBe('г. Иркутск, ул. Зверева, д. 9Б, стр. 2, эт. 3, кв. 15');
  });

  it('собирает только обязательную тройку без лишних запятых', () => {
    expect(
      formatPropertyAddress({ city: 'Москва', street: 'Тверская', house: '1' }),
    ).toBe('г. Москва, ул. Тверская, д. 1');
  });

  it.each([
    { city: null, street: 'Тверская', house: '1' },
    { city: 'Москва', street: null, house: '1' },
    { city: 'Москва', street: 'Тверская', house: null },
  ])('возвращает null без обязательной части: %p', (input) => {
    expect(formatPropertyAddress(input)).toBeNull();
  });

  it('считает пробельные значения пустыми', () => {
    expect(
      formatPropertyAddress({ city: '  ', street: 'Тверская', house: '1' }),
    ).toBeNull();
  });
});
