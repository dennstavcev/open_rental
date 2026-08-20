import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LeaseStatus } from '@prisma/client';
import { LeasesService } from './leases.service';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';

type PrismaMock = {
  lease: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  invitation: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

const validLeaseDto = {
  startDate: '2026-08-01',
  endDate: '2027-08-01',
  rentAmount: 50000,
  depositAmount: 50000,
  paymentDay: 20,
  penaltyRatePercentPerDay: 0.1,
};

describe('LeasesService', () => {
  let service: LeasesService;
  let prisma: PrismaMock;
  let properties: { findOneForOwner: jest.Mock };

  beforeEach(() => {
    prisma = {
      lease: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      invitation: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      // По умолчанию landlord с email, не совпадающим с приглашаемым.
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'landlord@x.ru' }) },
      // Интерактивная транзакция: вызываем колбэк с самим моком.
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    properties = { findOneForOwner: jest.fn() };
    const notifications = { notify: jest.fn().mockResolvedValue({}) };
    service = new LeasesService(
      prisma as unknown as PrismaService,
      properties as unknown as PropertiesService,
      notifications as unknown as import('../notifications/notifications.service').NotificationsService,
    );
  });

  describe('createDraft', () => {
    it('проверяет владение и отсутствие активного договора', async () => {
      properties.findOneForOwner.mockResolvedValue({ id: 'p1' });
      prisma.lease.findFirst.mockResolvedValue(null);
      prisma.lease.create.mockResolvedValue({ id: 'l1' });

      await service.createDraft('u1', 'p1', validLeaseDto);
      expect(properties.findOneForOwner).toHaveBeenCalledWith('u1', 'p1');
      expect(prisma.lease.create.mock.calls[0][0].data.landlordId).toBe('u1');
    });

    it('чужой объект → NotFound, договор не создаётся', async () => {
      properties.findOneForOwner.mockRejectedValue(new NotFoundException());
      await expect(
        service.createDraft('u1', 'p-foreign', validLeaseDto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.lease.create).not.toHaveBeenCalled();
    });

    it('на объекте уже есть активный договор → Conflict', async () => {
      properties.findOneForOwner.mockResolvedValue({ id: 'p1' });
      prisma.lease.findFirst.mockResolvedValue({ id: 'l-active' });
      await expect(
        service.createDraft('u1', 'p1', validLeaseDto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.lease.create).not.toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('draft → sent и создаёт приглашение', async () => {
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        landlordId: 'u1',
        status: LeaseStatus.draft,
      });
      prisma.lease.update.mockResolvedValue({ id: 'l1', status: 'sent' });
      prisma.invitation.create.mockResolvedValue({ id: 'inv1' });

      const res = await service.send('u1', 'l1', 'Tenant@Mail.ru');
      expect(prisma.lease.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { status: LeaseStatus.sent },
      });
      // email нормализуется в нижний регистр.
      expect(prisma.invitation.create.mock.calls[0][0].data.invitedEmail).toBe(
        'tenant@mail.ru',
      );
      expect(res.invitation.id).toBe('inv1');
    });

    it('чужой договор → NotFound', async () => {
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        landlordId: 'other',
        status: LeaseStatus.draft,
      });
      await expect(
        service.send('u1', 'l1', 't@mail.ru'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('нельзя пригласить самого себя → Conflict', async () => {
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        landlordId: 'u1',
        status: LeaseStatus.draft,
      });
      prisma.user.findUnique.mockResolvedValue({ email: 'self@mail.ru' });
      await expect(
        service.send('u1', 'l1', 'Self@Mail.ru'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('нельзя отправить не-черновик → Conflict', async () => {
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        landlordId: 'u1',
        status: LeaseStatus.sent,
      });
      await expect(
        service.send('u1', 'l1', 't@mail.ru'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listMyInvitations', () => {
    it('отдаёт, кто пригласил и на какой объект (не только свой email)', async () => {
      prisma.invitation.findMany.mockResolvedValue([
        {
          id: 'inv1',
          leaseId: 'l1',
          invitedEmail: 'tenant@mail.ru',
          status: 'pending',
          lease: {
            landlord: { fullName: 'Иван Петров', email: 'landlord@x.ru' },
            property: { address: 'Москва, Тверская 1' },
            startDate: new Date('2026-09-01'),
            endDate: new Date('2027-09-01'),
            rentAmount: 50000,
          },
        },
      ]);

      const [inv] = await service.listMyInvitations('Tenant@Mail.ru');
      // email приглашённого нормализуется в нижний регистр при поиске.
      expect(prisma.invitation.findMany.mock.calls[0][0].where.invitedEmail).toBe(
        'tenant@mail.ru',
      );
      expect(inv.landlord).toEqual({
        fullName: 'Иван Петров',
        email: 'landlord@x.ru',
      });
      expect(inv.property.address).toBe('Москва, Тверская 1');
      expect(inv.lease.rentAmount).toBe(50000);
      // Вложенный lease не протекает в ответ целиком.
      expect((inv as unknown as { lease: { landlord?: unknown } }).lease.landlord)
        .toBeUndefined();
    });
  });

  describe('getPayoutDetails', () => {
    it('арендатор видит реквизиты арендодателя по договору', async () => {
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        landlordId: 'u1',
        tenantId: 'tenant1',
      });
      prisma.user.findUnique.mockResolvedValue({
        payoutPhone: '+7 900 000-00-00',
        payoutBankName: 'Т-Банк',
        payoutNote: null,
      });

      const res = await service.getPayoutDetails('tenant1', 'l1');
      expect(res.payoutPhone).toBe('+7 900 000-00-00');
      expect(res.filled).toBe(true);
    });

    it('незаполненные реквизиты → filled=false', async () => {
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        landlordId: 'u1',
        tenantId: 'tenant1',
      });
      prisma.user.findUnique.mockResolvedValue({
        payoutPhone: null,
        payoutBankName: null,
        payoutNote: null,
      });
      const res = await service.getPayoutDetails('u1', 'l1');
      expect(res.filled).toBe(false);
    });

    it('посторонний не видит реквизиты → NotFound', async () => {
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        landlordId: 'u1',
        tenantId: 'tenant1',
      });
      await expect(
        service.getPayoutDetails('stranger', 'l1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('acceptInvitation', () => {
    const user = { id: 'tenant1', email: 'tenant@mail.ru' };

    it('привязывает tenant к договору при совпадении email', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv1',
        leaseId: 'l1',
        invitedEmail: 'tenant@mail.ru',
        status: 'pending',
      });
      prisma.lease.findUnique.mockResolvedValue({ id: 'l1', tenantId: null });
      prisma.invitation.update.mockResolvedValue({});
      prisma.lease.update.mockResolvedValue({ id: 'l1', tenantId: 'tenant1' });

      const lease = await service.acceptInvitation(user, 'inv1');
      expect(lease.tenantId).toBe('tenant1');
      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv1' },
        data: { status: 'accepted' },
      });
    });

    it('чужое приглашение (не тот email) → Forbidden', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv1',
        leaseId: 'l1',
        invitedEmail: 'someone-else@mail.ru',
        status: 'pending',
      });
      await expect(
        service.acceptInvitation(user, 'inv1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.lease.update).not.toHaveBeenCalled();
    });

    it('уже обработанное приглашение → Conflict', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv1',
        leaseId: 'l1',
        invitedEmail: 'tenant@mail.ru',
        status: 'accepted',
      });
      await expect(
        service.acceptInvitation(user, 'inv1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('getForUser', () => {
    it('посторонний пользователь не видит договор → NotFound', async () => {
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        landlordId: 'u1',
        tenantId: 'tenant1',
      });
      await expect(
        service.getForUser('stranger', 'l1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('tenant видит свой договор', async () => {
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        landlordId: 'u1',
        tenantId: 'tenant1',
      });
      const lease = await service.getForUser('tenant1', 'l1');
      expect(lease.id).toBe('l1');
    });
  });
});
