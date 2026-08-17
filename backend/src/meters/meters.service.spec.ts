import { NotFoundException } from '@nestjs/common';
import { MeterType } from '@prisma/client';
import { MetersService } from './meters.service';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';

type PrismaMock = {
  meter: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
};

describe('MetersService', () => {
  let service: MetersService;
  let prisma: PrismaMock;
  let properties: { findOneForOwner: jest.Mock };

  beforeEach(() => {
    prisma = {
      meter: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    properties = { findOneForOwner: jest.fn() };
    service = new MetersService(
      prisma as unknown as PrismaService,
      properties as unknown as PropertiesService,
    );
  });

  it('create проверяет владение и создаёт счётчик', async () => {
    properties.findOneForOwner.mockResolvedValue({ id: 'p1' });
    prisma.meter.create.mockResolvedValue({ id: 'm1' });
    await service.create('u1', 'p1', {
      meterType: MeterType.electricity,
      name: 'День',
      serialNumber: 'SN-001',
      tariff: 5.47,
      initialReading: 1200,
    });
    expect(properties.findOneForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(prisma.meter.create.mock.calls[0][0].data.propertyId).toBe('p1');
    expect(prisma.meter.create.mock.calls[0][0].data.initialReading).toBe(
      1200,
    );
  });

  it('create на чужой объект → NotFound, счётчик не создаётся', async () => {
    properties.findOneForOwner.mockRejectedValue(new NotFoundException());
    await expect(
      service.create('u1', 'p-foreign', {
        meterType: MeterType.water,
        name: 'ХВС',
        tariff: 40,
        initialReading: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.meter.create).not.toHaveBeenCalled();
  });

  it('update чужого/несуществующего счётчика → NotFound', async () => {
    properties.findOneForOwner.mockResolvedValue({ id: 'p1' });
    prisma.meter.findFirst.mockResolvedValue(null);
    await expect(
      service.update('u1', 'p1', 'm-foreign', { tariff: 6 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.meter.update).not.toHaveBeenCalled();
  });

  it('list фильтруется по объекту и подмешивает lastReadingValue', async () => {
    properties.findOneForOwner.mockResolvedValue({ id: 'p1' });
    prisma.meter.findMany.mockResolvedValue([
      { id: 'm1', initialReading: 100, readings: [{ value: 250 }] },
      { id: 'm2', initialReading: 50, readings: [] },
    ]);
    const result = await service.findAll('u1', 'p1');
    expect(prisma.meter.findMany.mock.calls[0][0].where).toEqual({
      propertyId: 'p1',
    });
    expect(result[0].lastReadingValue).toBe(250);
    expect(result[1].lastReadingValue).toBe(50);
    expect((result[0] as { readings?: unknown }).readings).toBeUndefined();
  });
});
