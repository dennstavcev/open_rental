import { NotFoundException } from '@nestjs/common';
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
      address: 'Москва, Тверская 1',
      propertyType: 'apartment',
    });
    expect(prisma.property.create.mock.calls[0][0].data.ownerId).toBe('u1');
  });

  it('не передаёт timezone, если он не задан (сработает дефолт БД)', async () => {
    prisma.property.create.mockResolvedValue({ id: 'p1' });
    await service.create('u1', {
      address: 'адрес',
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
      service.update('u1', 'p-foreign', { address: 'new' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('update своего объекта проходит', async () => {
    prisma.property.findFirst.mockResolvedValue({ id: 'p1', ownerId: 'u1' });
    prisma.property.update.mockResolvedValue({ id: 'p1', address: 'new' });
    const res = await service.update('u1', 'p1', { address: 'new' });
    expect(res.address).toBe('new');
  });
});
