import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreatePropertyDto } from './create-property.dto';
import { UpdatePropertyDto } from './update-property.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });

function transform<T>(metatype: new () => T, value: unknown): Promise<T> {
  return pipe.transform(value, { type: 'body', metatype });
}

describe('Property DTO', () => {
  it('нормализует поля создания и отсекает свободный address', async () => {
    const dto = await transform(CreatePropertyDto, {
      address: 'старый свободный адрес',
      city: '  Москва ',
      street: ' Тверская  ',
      house: ' 1 ',
      building: '   ',
      cadastralNumber: ' 38:36:000021:1234 ',
      propertyType: 'apartment',
    });

    expect(dto).toMatchObject({
      city: 'Москва',
      street: 'Тверская',
      house: '1',
      building: null,
      cadastralNumber: '38:36:000021:1234',
    });
    expect(dto).not.toHaveProperty('address');
  });

  it('отклоняет пробелы вместо обязательных полей', async () => {
    await expect(
      transform(CreatePropertyDto, {
        city: '   ',
        street: 'Тверская',
        house: '1',
        propertyType: 'apartment',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['38:36:000021:1234', '24:5:111213:1'])(
    'принимает кадастровый номер %s',
    async (cadastralNumber) => {
      await expect(
        transform(CreatePropertyDto, {
          city: 'Москва',
          street: 'Тверская',
          house: '1',
          propertyType: 'apartment',
          cadastralNumber,
        }),
      ).resolves.toMatchObject({ cadastralNumber });
    },
  );

  it.each(['abc', '38-36-000021-1234', '38:36:000021'])(
    'отклоняет неверный кадастровый номер %s',
    async (cadastralNumber) => {
      await expect(
        transform(CreatePropertyDto, {
          city: 'Москва',
          street: 'Тверская',
          house: '1',
          propertyType: 'apartment',
          cadastralNumber,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('превращает пробельное необязательное поле PATCH в null', async () => {
    await expect(
      transform(UpdatePropertyDto, { building: '   ' }),
    ).resolves.toMatchObject({ building: null });
  });
});
