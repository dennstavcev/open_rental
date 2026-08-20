import { ConflictException, NotFoundException } from '@nestjs/common';
import { LeaseInventoryItemsService } from './lease-inventory-items.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from './leases.service';

type PrismaMock = {
  leaseInventoryItem: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

describe('LeaseInventoryItemsService', () => {
  let service: LeaseInventoryItemsService;
  let prisma: PrismaMock;
  let leases: { getOwnedDraft: jest.Mock; getForUser: jest.Mock };

  beforeEach(() => {
    prisma = {
      leaseInventoryItem: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    leases = { getOwnedDraft: jest.fn(), getForUser: jest.fn() };
    service = new LeaseInventoryItemsService(
      prisma as unknown as PrismaService,
      leases as unknown as LeasesService,
    );
  });

  it('create проверяет, что договор — черновик владельца, и создаёт позицию', async () => {
    leases.getOwnedDraft.mockResolvedValue({ id: 'l1', landlordId: 'u1' });
    prisma.leaseInventoryItem.create.mockResolvedValue({ id: 'i1' });

    await service.create('u1', 'l1', { type: 'Холодильник', brand: 'Bosch' });

    expect(leases.getOwnedDraft).toHaveBeenCalledWith('u1', 'l1');
    const data = prisma.leaseInventoryItem.create.mock.calls[0][0].data;
    expect(data.leaseId).toBe('l1');
    expect(data.type).toBe('Холодильник');
    expect(data.quantity).toBe(1); // дефолт, если не передано
  });

  it('create по договору не в статусе черновика → ConflictException', async () => {
    leases.getOwnedDraft.mockRejectedValue(
      new ConflictException('Действие доступно только для договора в статусе черновика'),
    );
    await expect(
      service.create('u1', 'l1', { type: 'Диван' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('findAll доступен обеим сторонам договора', async () => {
    leases.getForUser.mockResolvedValue({ id: 'l1' });
    prisma.leaseInventoryItem.findMany.mockResolvedValue([{ id: 'i1' }]);
    const result = await service.findAll('tenant1', 'l1');
    expect(leases.getForUser).toHaveBeenCalledWith('tenant1', 'l1');
    expect(result).toEqual([{ id: 'i1' }]);
  });

  it('update чужой/несуществующей позиции → NotFound', async () => {
    leases.getOwnedDraft.mockResolvedValue({ id: 'l1', landlordId: 'u1' });
    prisma.leaseInventoryItem.findFirst.mockResolvedValue(null);
    await expect(
      service.update('u1', 'l1', 'missing', { brand: 'LG' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove удаляет позицию, принадлежащую договору', async () => {
    leases.getOwnedDraft.mockResolvedValue({ id: 'l1', landlordId: 'u1' });
    prisma.leaseInventoryItem.findFirst.mockResolvedValue({ id: 'i1', leaseId: 'l1' });
    await service.remove('u1', 'l1', 'i1');
    expect(prisma.leaseInventoryItem.delete).toHaveBeenCalledWith({
      where: { id: 'i1' },
    });
  });
});
