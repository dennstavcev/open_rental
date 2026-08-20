import { NotFoundException } from '@nestjs/common';
import { LeaseParty } from '@prisma/client';
import { PartyInfoService } from './party-info.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { PartyInfoDto } from './dto/party-info.dto';

type PrismaMock = {
  lease: { findUnique: jest.Mock; findMany: jest.Mock };
  leasePartyInfo: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };
};

const lease = { id: 'l1', landlordId: 'landlord1', tenantId: 'tenant1' };

const dto: PartyInfoDto = {
  passportSeries: '4510',
  passportNumber: '123456',
  passportIssuedBy: 'ОУФМС района Тверской г. Москвы',
  birthDate: '1995-05-20',
  registrationAddress: 'Москва, ул. Ленина, д. 5, кв. 10',
  phone: '+79991234567',
};

describe('PartyInfoService', () => {
  let service: PartyInfoService;
  let prisma: PrismaMock;
  let crypto: jest.Mocked<Pick<CryptoService, 'encrypt' | 'decrypt'>>;

  beforeEach(() => {
    prisma = {
      lease: { findUnique: jest.fn(), findMany: jest.fn() },
      leasePartyInfo: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    crypto = { encrypt: jest.fn(), decrypt: jest.fn() };
    service = new PartyInfoService(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
    );
  });

  it('арендодатель вносит свои данные — роль определяется по landlordId', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    crypto.encrypt.mockReturnValue('enc:landlord');

    const res = await service.upsert('landlord1', 'l1', dto);

    expect(res).toEqual({ leaseId: 'l1', role: LeaseParty.landlord });
    expect(crypto.encrypt).toHaveBeenCalledWith(JSON.stringify(dto));
    expect(prisma.leasePartyInfo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leaseId_role: { leaseId: 'l1', role: LeaseParty.landlord } },
      }),
    );
  });

  it('арендатор вносит свои данные — роль определяется по tenantId', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    crypto.encrypt.mockReturnValue('enc:tenant');

    const res = await service.upsert('tenant1', 'l1', dto);

    expect(res).toEqual({ leaseId: 'l1', role: LeaseParty.tenant });
  });

  it('посторонний пользователь → NotFound (не подменить роль)', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    await expect(
      service.upsert('stranger', 'l1', dto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('читает свою запись и расшифровывает её', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    prisma.leasePartyInfo.findUnique.mockResolvedValue({
      dataEnc: 'enc:tenant',
    });
    crypto.decrypt.mockReturnValue(JSON.stringify(dto));

    const res = await service.getOwn('tenant1', 'l1');

    expect(crypto.decrypt).toHaveBeenCalledWith('enc:tenant');
    expect(res).toEqual(dto);
  });

  it('нет своей записи → NotFound', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    prisma.leasePartyInfo.findUnique.mockResolvedValue(null);
    await expect(service.getOwn('tenant1', 'l1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('SuperAdmin читает любую сторону по роли напрямую', async () => {
    prisma.leasePartyInfo.findUnique.mockResolvedValue({
      dataEnc: 'enc:landlord',
    });
    crypto.decrypt.mockReturnValue(JSON.stringify(dto));

    const res = await service.getAsSuperAdmin('l1', LeaseParty.landlord);

    expect(prisma.leasePartyInfo.findUnique).toHaveBeenCalledWith({
      where: { leaseId_role: { leaseId: 'l1', role: LeaseParty.landlord } },
    });
    expect(res).toEqual(dto);
  });

  describe('runRetention (ADR-0021)', () => {
    const now = new Date('2030-01-01T00:00:00Z');

    it('удаляет ПДн договора, завершённого более 3 лет назад, без споров', async () => {
      prisma.lease.findMany.mockResolvedValue([
        {
          id: 'l1',
          endDate: new Date('2026-06-01T00:00:00Z'),
          effectiveEndDate: null,
          maintenanceRequests: [],
        },
      ]);
      prisma.leasePartyInfo.deleteMany.mockResolvedValue({ count: 2 });

      const res = await service.runRetention(now);

      expect(res).toEqual({ deleted: 2 });
      expect(prisma.leasePartyInfo.deleteMany).toHaveBeenCalledWith({
        where: { leaseId: 'l1' },
      });
    });

    it('не трогает договор младше 3 лет', async () => {
      prisma.lease.findMany.mockResolvedValue([
        {
          id: 'l1',
          endDate: new Date('2028-06-01T00:00:00Z'),
          effectiveEndDate: null,
          maintenanceRequests: [],
        },
      ]);

      const res = await service.runRetention(now);

      expect(res).toEqual({ deleted: 0 });
      expect(prisma.leasePartyInfo.deleteMany).not.toHaveBeenCalled();
    });

    it('откладывает удаление при незакрытой заявке (активный спор)', async () => {
      prisma.lease.findMany.mockResolvedValue([
        {
          id: 'l1',
          endDate: new Date('2026-06-01T00:00:00Z'),
          effectiveEndDate: null,
          maintenanceRequests: [{ id: 'm1' }],
        },
      ]);

      const res = await service.runRetention(now);

      expect(res).toEqual({ deleted: 0 });
      expect(prisma.leasePartyInfo.deleteMany).not.toHaveBeenCalled();
    });

    it('effectiveEndDate имеет приоритет над endDate (расторжение раньше срока)', async () => {
      prisma.lease.findMany.mockResolvedValue([
        {
          id: 'l1',
          endDate: new Date('2029-06-01T00:00:00Z'), // формально ещё не истёк
          effectiveEndDate: new Date('2026-01-01T00:00:00Z'), // но расторгнут раньше
          maintenanceRequests: [],
        },
      ]);
      prisma.leasePartyInfo.deleteMany.mockResolvedValue({ count: 1 });

      const res = await service.runRetention(now);

      expect(res).toEqual({ deleted: 1 });
    });
  });
});
