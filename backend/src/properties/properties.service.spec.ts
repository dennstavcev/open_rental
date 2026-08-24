import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillStage, LeaseStatus, Prisma } from '@prisma/client';

type PrismaMock = {
  property: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  lease: { findMany: jest.Mock };
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
      lease: { findMany: jest.fn() },
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

  describe('история арендаторов', () => {
    beforeEach(() => {
      prisma.property.findFirst.mockResolvedValue({ id: 'p1', ownerId: 'u1' });
    });

    it('проверяет владение до чтения договоров', async () => {
      prisma.property.findFirst.mockResolvedValue(null);

      await expect(service.getLeaseHistory('u1', 'p-foreign')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.lease.findMany).not.toHaveBeenCalled();
    });

    it('читает только завершённые договоры этого landlord и финальные счета', async () => {
      prisma.lease.findMany.mockResolvedValue([]);

      await expect(service.getLeaseHistory('u1', 'p1')).resolves.toEqual([]);
      expect(prisma.lease.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            propertyId: 'p1',
            landlordId: 'u1',
            status: LeaseStatus.terminated,
          },
          select: expect.objectContaining({
            bills: expect.objectContaining({
              where: { stage: BillStage.final },
            }),
          }),
        }),
      );
    });

    it('считает оплаты вовремя, поздние и неоплаченные', async () => {
      const due = new Date('2026-03-20T12:00:00.000Z');
      prisma.lease.findMany.mockResolvedValue([
        {
          id: 'l1',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-06-01T00:00:00.000Z'),
          effectiveEndDate: new Date('2026-05-10T00:00:00.000Z'),
          rentAmount: new Prisma.Decimal(45_000),
          tenant: { email: 'tenant@example.test' },
          bills: [
            { dueDate: due, payment: { confirmedAt: due } },
            {
              dueDate: due,
              payment: { confirmedAt: new Date('2026-03-21T12:00:00.000Z') },
            },
            { dueDate: due, payment: null },
          ],
        },
      ]);

      await expect(service.getLeaseHistory('u1', 'p1')).resolves.toEqual([
        {
          leaseId: 'l1',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-06-01T00:00:00.000Z'),
          effectiveEndDate: new Date('2026-05-10T00:00:00.000Z'),
          tenantEmail: 'tenant@example.test',
          monthlyRent: 45_000,
          payments: { finalBills: 3, paidOnTime: 1, paidLate: 1, unpaid: 1 },
        },
      ]);
    });

    it('сортирует по фактическому окончанию и допускает tenant=null', async () => {
      const row = (id: string, endDate: string, effectiveEndDate: string | null) => ({
        id,
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        endDate: new Date(endDate),
        effectiveEndDate: effectiveEndDate ? new Date(effectiveEndDate) : null,
        rentAmount: new Prisma.Decimal(1),
        tenant: null,
        bills: [],
      });
      prisma.lease.findMany.mockResolvedValue([
        row('planned-later', '2026-12-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'),
        row('actually-later', '2026-03-01T00:00:00.000Z', null),
      ]);

      const history = await service.getLeaseHistory('u1', 'p1');
      expect(history.map((entry) => entry.leaseId)).toEqual([
        'actually-later',
        'planned-later',
      ]);
      expect(history[0].tenantEmail).toBeNull();
      expect(history[0].payments.finalBills).toBe(0);
    });
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
