import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { PrismaService } from '../prisma/prisma.service';

type PrismaMock = {
  property: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
};

describe('PropertiesService', () => {
  let service: PropertiesService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      property: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new PropertiesService(prisma as unknown as PrismaService);
  });

  it('создаёт объект, привязанный к владельцу', async () => {
    prisma.property.create.mockResolvedValue({ id: 'p1', ownerId: 'u1' });
    await service.create('u1', {
      city: 'Москва',
      street: 'Тверская',
      house: '1',
      propertyType: 'apartment',
    });
    expect(prisma.property.create.mock.calls[0][0].data).toMatchObject({
      ownerId: 'u1',
      city: 'Москва',
      street: 'Тверская',
      house: '1',
      address: 'г. Москва, ул. Тверская, д. 1',
    });
  });

  it('не передаёт timezone, если он не задан (сработает дефолт БД)', async () => {
    prisma.property.create.mockResolvedValue({ id: 'p1' });
    await service.create('u1', {
      city: 'Москва',
      street: 'Тверская',
      house: '1',
      propertyType: 'room',
    });
    expect(
      prisma.property.create.mock.calls[0][0].data,
    ).not.toHaveProperty('timezone');
  });

  it('список фильтруется по владельцу', async () => {
    prisma.property.findMany.mockResolvedValue([]);
    await service.findAllForOwner('u1');
    expect(prisma.property.findMany.mock.calls[0][0].where).toEqual({
      ownerId: 'u1',
    });
    expect(prisma.property.findMany.mock.calls[0][0].orderBy).toEqual([
      { city: 'asc' },
      { street: 'asc' },
      { house: 'asc' },
      { createdAt: 'desc' },
    ]);
  });

  it('чужой/несуществующий объект → NotFound', async () => {
    prisma.property.findFirst.mockResolvedValue(null);
    await expect(
      service.findOneForOwner('u1', 'p-foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update проверяет владение до записи', async () => {
    prisma.property.findFirst.mockResolvedValue(null);
    await expect(
      service.update('u1', 'p-foreign', { areaSqm: 50 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('неадресный update legacy-объекта сохраняет прежний address', async () => {
    prisma.property.findFirst.mockResolvedValue({
      id: 'p1',
      ownerId: 'u1',
      address: 'старый адрес',
      city: null,
      street: null,
      house: null,
      building: null,
      floor: null,
      apartment: null,
    });
    prisma.property.update.mockResolvedValue({ id: 'p1', address: 'старый адрес' });
    const res = await service.update('u1', 'p1', { areaSqm: 50 });
    expect(res.address).toBe('старый адрес');
    expect(prisma.property.update.mock.calls[0][0].data).not.toHaveProperty(
      'address',
    );
  });

  it.each([
    { apartment: '15' },
    { city: 'Москва' },
  ])('не пишет частичный адрес в legacy-объект: %p', async (update) => {
    prisma.property.findFirst.mockResolvedValue({
      id: 'p1',
      ownerId: 'u1',
      address: 'старый адрес',
      city: null,
      street: null,
      house: null,
      building: null,
      floor: null,
      apartment: null,
    });

    await expect(service.update('u1', 'p1', update)).rejects.toThrow(
      new BadRequestException('Укажите город, улицу и дом целиком'),
    );
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('разрешает изменить только квартиру у объекта с заполненной тройкой', async () => {
    prisma.property.findFirst.mockResolvedValue({
      id: 'p1',
      ownerId: 'u1',
      address: 'г. Москва, ул. Тверская, д. 1, кв. 10',
      city: 'Москва',
      street: 'Тверская',
      house: '1',
      building: null,
      floor: null,
      apartment: '10',
    });
    prisma.property.update.mockResolvedValue({ id: 'p1' });

    await service.update('u1', 'p1', { apartment: '15' });

    expect(prisma.property.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        apartment: '15',
        address: 'г. Москва, ул. Тверская, д. 1, кв. 15',
      },
    });
  });

  it('полная тройка переводит legacy-объект на структурированный адрес', async () => {
    prisma.property.findFirst.mockResolvedValue({
      id: 'p1',
      ownerId: 'u1',
      address: 'старый адрес',
      city: null,
      street: null,
      house: null,
      building: null,
      floor: null,
      apartment: null,
    });
    prisma.property.update.mockResolvedValue({ id: 'p1' });

    await service.update('u1', 'p1', {
      city: 'Москва',
      street: 'Тверская',
      house: '1',
    });

    expect(prisma.property.update.mock.calls[0][0].data.address).toBe(
      'г. Москва, ул. Тверская, д. 1',
    );
  });

  it('очищает строение и пересобирает кеш без него', async () => {
    prisma.property.findFirst.mockResolvedValue({
      id: 'p1',
      ownerId: 'u1',
      address: 'г. Москва, ул. Тверская, д. 1, стр. 2',
      city: 'Москва',
      street: 'Тверская',
      house: '1',
      building: '2',
      floor: null,
      apartment: null,
    });
    prisma.property.update.mockResolvedValue({ id: 'p1' });

    await service.update('u1', 'p1', { building: null });

    expect(prisma.property.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { building: null, address: 'г. Москва, ул. Тверская, д. 1' },
    });
  });
});
