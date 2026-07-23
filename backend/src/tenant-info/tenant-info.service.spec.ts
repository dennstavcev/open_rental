import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantInfoService } from './tenant-info.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from '../leases/leases.service';
import { CryptoService } from '../crypto/crypto.service';

const KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const lease = { id: 'l1', landlordId: 'landlord1', tenantId: 'tenant1' };
const dto = {
  passportSeries: '1234',
  passportNumber: '567890',
  passportIssuedBy: 'ОВД',
  birthDate: '1990-01-01',
  registrationAddress: 'Москва',
};

describe('TenantInfoService', () => {
  let service: TenantInfoService;
  let prisma: any;
  let leases: { getForUser: jest.Mock };
  let crypto: CryptoService;

  beforeEach(() => {
    prisma = {
      tenantInfo: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
    };
    leases = { getForUser: jest.fn().mockResolvedValue(lease) };
    crypto = new CryptoService(new ConfigService({ ENCRYPTION_KEY: KEY }));
    service = new TenantInfoService(
      prisma as unknown as PrismaService,
      leases as unknown as LeasesService,
      crypto,
    );
  });

  it('арендатор сохраняет данные в зашифрованном виде', async () => {
    await service.upsert('tenant1', 'l1', dto);
    const stored = prisma.tenantInfo.upsert.mock.calls[0][0].create.dataEnc;
    expect(stored).not.toContain('567890'); // зашифровано
    expect(JSON.parse(crypto.decrypt(stored)).passportNumber).toBe('567890');
  });

  it('landlord не может сохранить данные арендатора', async () => {
    await expect(
      service.upsert('landlord1', 'l1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SuperAdmin читает сырые данные без участия в договоре', async () => {
    const enc = crypto.encrypt(JSON.stringify(dto));
    prisma.tenantInfo.findUnique.mockResolvedValue({ dataEnc: enc });
    const res = await service.get(
      { id: 'admin', email: 'a', isSuperAdmin: true },
      'l1',
    );
    expect(res.passportNumber).toBe('567890');
    expect(leases.getForUser).not.toHaveBeenCalled(); // доступ не через договор
  });

  it('landlord (сторона, но не арендатор) не читает ПДн', async () => {
    const enc = crypto.encrypt(JSON.stringify(dto));
    prisma.tenantInfo.findUnique.mockResolvedValue({ dataEnc: enc });
    await expect(
      service.get({ id: 'landlord1', email: 'l', isSuperAdmin: false }, 'l1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('нет данных → NotFound', async () => {
    prisma.tenantInfo.findUnique.mockResolvedValue(null);
    await expect(
      service.get({ id: 'tenant1', email: 't', isSuperAdmin: false }, 'l1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
