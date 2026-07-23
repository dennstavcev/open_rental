import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MaintenanceStatus, SettlementPayer } from '@prisma/client';
import { MaintenanceService } from './maintenance.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from '../leases/leases.service';
import { BillingService } from '../billing/billing.service';
import { StorageProvider } from '../storage/storage-provider.interface';

const lease = {
  id: 'l1',
  propertyId: 'p1',
  landlordId: 'landlord1',
  tenantId: 'tenant1',
};

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let prisma: any;
  let leases: { getForUser: jest.Mock };
  let billing: { addSettlementLine: jest.Mock };
  let storage: jest.Mocked<StorageProvider>;

  beforeEach(() => {
    prisma = {
      maintenanceRequest: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'req1', ...data })),
      },
    };
    leases = { getForUser: jest.fn().mockResolvedValue(lease) };
    billing = { addSettlementLine: jest.fn() };
    storage = { put: jest.fn(), get: jest.fn(), delete: jest.fn(), getUrl: jest.fn() };
    service = new MaintenanceService(
      prisma as unknown as PrismaService,
      leases as unknown as LeasesService,
      billing as unknown as BillingService,
      storage,
    );
  });

  describe('create', () => {
    it('только tenant создаёт заявку', async () => {
      await expect(
        service.create('landlord1', 'l1', { category: 'repair', description: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('tenant создаёт заявку', async () => {
      prisma.maintenanceRequest.create.mockResolvedValue({ id: 'req1' });
      await service.create('tenant1', 'l1', { category: 'repair', description: 'кран течёт' });
      expect(prisma.maintenanceRequest.create.mock.calls[0][0].data.createdById).toBe(
        'tenant1',
      );
    });
  });

  describe('updateStatus', () => {
    it('только landlord меняет статус', async () => {
      prisma.maintenanceRequest.findUnique.mockResolvedValue({ id: 'req1', leaseId: 'l1' });
      await expect(
        service.updateStatus('tenant1', 'req1', MaintenanceStatus.in_progress),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('settlement', () => {
    it('предложение подтверждается только инициатором', async () => {
      prisma.maintenanceRequest.findUnique.mockResolvedValue({
        id: 'req1',
        leaseId: 'l1',
        settlementAppliedAt: null,
      });
      const res = await service.proposeSettlement('tenant1', 'req1', {
        amount: 4000,
        payer: SettlementPayer.split,
      });
      expect(res.confirmedByTenant).toBe(true);
      expect(res.confirmedByLandlord).toBe(false);
    });

    it('подтверждение одной стороной не применяет сумму', async () => {
      prisma.maintenanceRequest.findUnique.mockResolvedValue({
        id: 'req1',
        leaseId: 'l1',
        settlementAppliedAt: null,
        settlementAmount: 4000,
        settlementPayer: SettlementPayer.split,
        confirmedByTenant: false,
        confirmedByLandlord: false,
      });
      // Подтверждает только tenant.
      await service.confirmSettlement('tenant1', 'req1');
      expect(billing.addSettlementLine).not.toHaveBeenCalled();
    });

    it('двустороннее подтверждение (split) добавляет половину в счёт', async () => {
      prisma.maintenanceRequest.findUnique.mockResolvedValue({
        id: 'req1',
        leaseId: 'l1',
        category: 'repair',
        settlementAppliedAt: null,
        settlementAmount: 4000,
        settlementPayer: SettlementPayer.split,
        confirmedByTenant: true, // tenant уже подтвердил
        confirmedByLandlord: false,
      });
      // Подтверждает landlord → обе стороны.
      await service.confirmSettlement('landlord1', 'req1');
      expect(billing.addSettlementLine).toHaveBeenCalledWith(
        lease,
        expect.objectContaining({ amount: 2000, sourceRefId: 'req1' }),
      );
    });

    it('payer=owner не добавляет строку арендатору', async () => {
      prisma.maintenanceRequest.findUnique.mockResolvedValue({
        id: 'req1',
        leaseId: 'l1',
        category: 'repair',
        settlementAppliedAt: null,
        settlementAmount: 4000,
        settlementPayer: SettlementPayer.owner,
        confirmedByTenant: true,
        confirmedByLandlord: false,
      });
      await service.confirmSettlement('landlord1', 'req1');
      expect(billing.addSettlementLine).not.toHaveBeenCalled();
    });

    it('повторное применение → Conflict', async () => {
      prisma.maintenanceRequest.findUnique.mockResolvedValue({
        id: 'req1',
        leaseId: 'l1',
        settlementAppliedAt: new Date(),
      });
      await expect(
        service.confirmSettlement('landlord1', 'req1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
