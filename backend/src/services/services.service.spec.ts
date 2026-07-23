import { NotFoundException } from '@nestjs/common';
import { ServiceType } from '@prisma/client';
import { ServicesService } from './services.service';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';

type PrismaMock = {
  service: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

describe('ServicesService', () => {
  let service: ServicesService;
  let prisma: PrismaMock;
  let properties: { findOneForOwner: jest.Mock };

  beforeEach(() => {
    prisma = {
      service: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    properties = { findOneForOwner: jest.fn() };
    service = new ServicesService(
      prisma as unknown as PrismaService,
      properties as unknown as PropertiesService,
    );
  });

  it('create проверяет владение объектом и создаёт услугу', async () => {
    properties.findOneForOwner.mockResolvedValue({ id: 'p1' });
    prisma.service.create.mockResolvedValue({ id: 's1' });
    await service.create('u1', 'p1', {
      name: 'Интернет',
      price: 500,
      serviceType: ServiceType.monthly,
    });
    expect(properties.findOneForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(prisma.service.create.mock.calls[0][0].data.propertyId).toBe('p1');
  });

  it('create на чужой объект → NotFound, услуга не создаётся', async () => {
    properties.findOneForOwner.mockRejectedValue(new NotFoundException());
    await expect(
      service.create('u1', 'p-foreign', {
        name: 'x',
        price: 1,
        serviceType: ServiceType.one_time,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.service.create).not.toHaveBeenCalled();
  });

  it('update чужой/несуществующей услуги → NotFound', async () => {
    properties.findOneForOwner.mockResolvedValue({ id: 'p1' });
    prisma.service.findFirst.mockResolvedValue(null);
    await expect(
      service.update('u1', 'p1', 's-foreign', { price: 10 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  it('remove своей услуги проходит', async () => {
    properties.findOneForOwner.mockResolvedValue({ id: 'p1' });
    prisma.service.findFirst.mockResolvedValue({ id: 's1', propertyId: 'p1' });
    prisma.service.delete.mockResolvedValue({});
    await service.remove('u1', 'p1', 's1');
    expect(prisma.service.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });
});
