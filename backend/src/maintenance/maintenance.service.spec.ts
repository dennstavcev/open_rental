import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  LeaseStatus,
  MaintenanceStatus,
  ServiceType,
  SettlementPayer,
} from '@prisma/client';
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
  status: LeaseStatus.active,
};

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let prisma: any;
  let leases: { getForUser: jest.Mock };
  let billing: {
    ensureCurrentDraft: jest.Mock;
    resolveRequestWithService: jest.Mock;
  };
  let storage: jest.Mocked<StorageProvider>;

  beforeEach(() => {
    prisma = {
      maintenanceRequest: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'req1', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      service: {
        create: jest.fn().mockResolvedValue({ id: 's1' }),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    leases = { getForUser: jest.fn().mockResolvedValue(lease) };
    billing = {
      ensureCurrentDraft: jest.fn(),
      resolveRequestWithService: jest
        .fn()
        .mockImplementation((_lease, request) => ({
          ...request,
          status: MaintenanceStatus.resolved,
        })),
    };
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

    it('resolved выставляет согласованную услугу и сохраняет статус', async () => {
      const request = {
        id: 'req1',
        leaseId: 'l1',
        category: 'Сантехника',
        status: MaintenanceStatus.in_progress,
      };
      const oneTimeService = { id: 's1', billedAt: null };
      prisma.maintenanceRequest.findUnique.mockResolvedValue(request);
      prisma.service.findUnique.mockResolvedValue(oneTimeService);

      const result = await service.updateStatus(
        'landlord1',
        'req1',
        MaintenanceStatus.resolved,
      );

      expect(billing.ensureCurrentDraft).toHaveBeenCalledWith(lease);
      expect(billing.resolveRequestWithService).toHaveBeenCalledWith(
        lease,
        request,
        oneTimeService,
      );
      expect(result.status).toBe(MaintenanceStatus.resolved);
    });

    it('повторный resolved с billedAt не создаёт вторую строку', async () => {
      prisma.maintenanceRequest.findUnique.mockResolvedValue({
        id: 'req1',
        leaseId: 'l1',
        status: MaintenanceStatus.resolved,
      });
      prisma.service.findUnique.mockResolvedValue({
        id: 's1',
        billedAt: new Date(),
      });

      await service.updateStatus(
        'landlord1',
        'req1',
        MaintenanceStatus.resolved,
      );

      expect(billing.resolveRequestWithService).not.toHaveBeenCalled();
      expect(prisma.maintenanceRequest.update).toHaveBeenCalled();
    });

    it('повторный resolved достреливает услугу без billedAt', async () => {
      const request = {
        id: 'req1',
        leaseId: 'l1',
        category: 'Электрика',
        status: MaintenanceStatus.resolved,
      };
      const oneTimeService = { id: 's1', billedAt: null };
      prisma.maintenanceRequest.findUnique.mockResolvedValue(request);
      prisma.service.findUnique.mockResolvedValue(oneTimeService);

      await service.updateStatus(
        'landlord1',
        'req1',
        MaintenanceStatus.resolved,
      );

      expect(billing.resolveRequestWithService).toHaveBeenCalledWith(
        lease,
        request,
        oneTimeService,
      );
    });

    it('resolved без согласованной услуги разрешён', async () => {
      prisma.maintenanceRequest.findUnique.mockResolvedValue({
        id: 'req1',
        leaseId: 'l1',
      });
      prisma.service.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('landlord1', 'req1', MaintenanceStatus.resolved),
      ).resolves.toEqual(
        expect.objectContaining({ status: MaintenanceStatus.resolved }),
      );
      expect(billing.ensureCurrentDraft).not.toHaveBeenCalled();
    });

    it('resolved по неактивному договору не создаёт черновик', async () => {
      leases.getForUser.mockResolvedValue({
        ...lease,
        status: LeaseStatus.terminated,
      });
      prisma.maintenanceRequest.findUnique.mockResolvedValue({
        id: 'req1',
        leaseId: 'l1',
      });
      prisma.service.findUnique.mockResolvedValue({ id: 's1', billedAt: null });

      await expect(
        service.updateStatus('landlord1', 'req1', MaintenanceStatus.resolved),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(billing.ensureCurrentDraft).not.toHaveBeenCalled();
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
      expect(prisma.service.create).not.toHaveBeenCalled();
    });

    it('двустороннее подтверждение создаёт разовую услугу, но не строку счёта', async () => {
      prisma.maintenanceRequest.findUnique.mockResolvedValue({
        id: 'req1',
        leaseId: 'l1',
        category: 'Сантехника',
        description: 'Течёт кран',
        settlementAppliedAt: null,
        settlementAmount: 4000,
        settlementPayer: SettlementPayer.split,
        confirmedByTenant: true, // tenant уже подтвердил
        confirmedByLandlord: false,
      });
      prisma.maintenanceRequest.findUnique
        .mockResolvedValueOnce({
          id: 'req1',
          leaseId: 'l1',
          category: 'Сантехника',
          description: 'Течёт кран',
          settlementAppliedAt: null,
          settlementAmount: 4000,
          settlementPayer: SettlementPayer.split,
          confirmedByTenant: true,
          confirmedByLandlord: false,
        })
        .mockResolvedValueOnce({ id: 'req1', settlementAppliedAt: new Date() });
      // Подтверждает landlord → обе стороны.
      await service.confirmSettlement('landlord1', 'req1');
      expect(prisma.service.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          propertyId: 'p1',
          name: 'Заявка: Сантехника',
          price: 4000,
          serviceType: ServiceType.one_time,
          payer: SettlementPayer.split,
          sourceRequestId: 'req1',
          description: 'Течёт кран',
          billedAt: null,
        }),
      });
    });

    it('гонка подтверждений: проигравший захват не создаёт вторую услугу', async () => {
      prisma.maintenanceRequest.findUnique.mockResolvedValue({
        id: 'req1',
        leaseId: 'l1',
        category: 'Ремонт',
        description: 'Описание',
        settlementAppliedAt: null,
        settlementAmount: 4000,
        settlementPayer: SettlementPayer.tenant,
        confirmedByTenant: true,
        confirmedByLandlord: false,
      });
      prisma.maintenanceRequest.updateMany.mockResolvedValue({ count: 0 });
      await service.confirmSettlement('landlord1', 'req1');
      expect(prisma.service.create).not.toHaveBeenCalled();
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
