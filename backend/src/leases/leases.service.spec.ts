import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InvitationStatus, LeaseStatus } from '@prisma/client';
import { LeasesService } from './leases.service';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InvitationLinkController } from './invitation-link.controller';

type PrismaMock = {
  lease: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  invitation: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

// Строка договора в том виде, в каком её отдаёт Prisma с include для
// LeaseView (ADR-0020) — объект, стороны и последнее приглашение.
function leaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    propertyId: 'p1',
    landlordId: 'u1',
    tenantId: null,
    status: LeaseStatus.draft,
    property: { id: 'p1', address: 'Москва, Тверская 1' },
    landlord: { id: 'u1', fullName: 'Иван Петров', email: 'landlord@x.ru' },
    tenant: null,
    invitations: [],
    ...overrides,
  };
}

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
  let notifications: { notify: jest.Mock };

  beforeEach(() => {
    prisma = {
      lease: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockImplementation(() => {
          const calls = prisma.lease.updateMany.mock.calls;
          const data = calls.length ? calls[calls.length - 1][0].data : {};
          return { id: 'l1', tenantId: null, status: LeaseStatus.draft, ...data };
        }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      invitation: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      // По умолчанию landlord с email, не совпадающим с приглашаемым.
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'landlord@x.ru' }) },
      // Интерактивная транзакция: вызываем колбэк с самим моком.
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    properties = { findOneForOwner: jest.fn() };
    notifications = { notify: jest.fn().mockResolvedValue({}) };
    service = new LeasesService(
      prisma as unknown as PrismaService,
      properties as unknown as PropertiesService,
      notifications as unknown as NotificationsService,
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
      prisma.lease.findUnique.mockResolvedValue(leaseRow());
      prisma.invitation.create.mockResolvedValue({ id: 'inv1' });

      const res = await service.send('u1', 'l1', 'Tenant@Mail.ru');
      expect(prisma.lease.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'l1',
          tenantId: null,
          status: { in: [LeaseStatus.draft, LeaseStatus.sent] },
        },
        data: { status: LeaseStatus.sent },
      });
      // email нормализуется в нижний регистр.
      expect(prisma.invitation.create.mock.calls[0][0].data.invitedEmail).toBe(
        'tenant@mail.ru',
      );
      expect(res.invitation.id).toBe('inv1');
      expect(prisma.lease.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.invitation.updateMany.mock.invocationCallOrder[0],
      );
    });

    it('чужой договор → NotFound', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        leaseRow({ landlordId: 'other' }),
      );
      await expect(
        service.send('u1', 'l1', 't@mail.ru'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('нельзя пригласить самого себя → Conflict', async () => {
      prisma.lease.findUnique.mockResolvedValue(leaseRow());
      prisma.user.findUnique.mockResolvedValue({ email: 'self@mail.ru' });
      await expect(
        service.send('u1', 'l1', 'Self@Mail.ru'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('повторная отправка по sent-договору отзывает прошлое приглашение', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        leaseRow({ status: LeaseStatus.sent }),
      );
      prisma.invitation.create.mockResolvedValue({ id: 'inv2' });

      const res = await service.send('u1', 'l1', 'fixed@mail.ru');
      // Опечатка в адресе исправляется одним действием: прошлое
      // приглашение отзывается, его токен перестаёт работать (ADR-0020).
      expect(prisma.invitation.updateMany).toHaveBeenCalledWith({
        where: { leaseId: 'l1', status: 'pending' },
        data: { status: 'cancelled' },
      });
      expect(res.invitation.id).toBe('inv2');
    });

    it('нельзя переотправить, если арендатор уже принял → Conflict', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        leaseRow({ status: LeaseStatus.sent, tenantId: 'tenant1' }),
      );
      await expect(
        service.send('u1', 'l1', 't@mail.ru'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('нельзя отправить по действующему договору → Conflict', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        leaseRow({ status: LeaseStatus.active, tenantId: 'tenant1' }),
      );
      await expect(
        service.send('u1', 'l1', 't@mail.ru'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('проигранный захват договора не отзывает и не создаёт приглашение', async () => {
      prisma.lease.findUnique.mockResolvedValue(leaseRow());
      prisma.lease.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.send('u1', 'l1', 'tenant@mail.ru'),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Договор изменился — обновите страницу',
      });
      expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('отзыв приглашения возвращает договор в черновик', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        leaseRow({ status: LeaseStatus.sent }),
      );
      const lease = await service.cancelInvitation('u1', 'l1');
      expect(prisma.invitation.updateMany).toHaveBeenCalledWith({
        where: { leaseId: 'l1', status: 'pending' },
        data: { status: 'cancelled' },
      });
      expect(lease.status).toBe('draft');
      expect(prisma.lease.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.invitation.updateMany.mock.invocationCallOrder[0],
      );
    });

    it('отзывать нечего, договор ещё черновик → Conflict', async () => {
      prisma.lease.findUnique.mockResolvedValue(leaseRow());
      await expect(
        service.cancelInvitation('u1', 'l1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('проигранный захват при отзыве не меняет приглашение', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        leaseRow({ status: LeaseStatus.sent }),
      );
      prisma.lease.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.cancelInvitation('u1', 'l1'),
      ).rejects.toMatchObject({ status: 409, message: 'Договор уже изменился' });
      expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
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
          token: 'secret-token',
          createdAt: new Date('2026-08-20'),
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
      expect(inv).not.toHaveProperty('token');
    });
  });

  describe('getInvitationByToken', () => {
    it('pending отдаёт ровно email и адрес объекта', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        invitedEmail: 'tenant@mail.ru',
        status: InvitationStatus.pending,
        lease: { property: { address: 'Москва, Тверская 1' } },
      });

      await expect(service.getInvitationByToken('token')).resolves.toEqual({
        invitedEmail: 'tenant@mail.ru',
        propertyAddress: 'Москва, Тверская 1',
      });
    });

    it.each([
      InvitationStatus.cancelled,
      InvitationStatus.accepted,
      InvitationStatus.declined,
      null,
    ])('непригодное состояние %s даёт одинаковый 404', async (status) => {
      prisma.invitation.findUnique.mockResolvedValue(
        status
          ? {
              invitedEmail: 'tenant@mail.ru',
              status,
              lease: { property: { address: 'Москва' } },
            }
          : null,
      );

      await expect(service.getInvitationByToken('token')).rejects.toMatchObject({
        status: 404,
        message: 'Приглашение не найдено или уже недействительно',
      });
    });
  });

  describe('getPayoutDetails', () => {
    it('арендатор видит реквизиты арендодателя по договору', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        leaseRow({ tenantId: 'tenant1' }),
      );
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
      prisma.lease.findUnique.mockResolvedValue(
        leaseRow({ tenantId: 'tenant1' }),
      );
      prisma.user.findUnique.mockResolvedValue({
        payoutPhone: null,
        payoutBankName: null,
        payoutNote: null,
      });
      const res = await service.getPayoutDetails('u1', 'l1');
      expect(res.filled).toBe(false);
    });

    it('посторонний не видит реквизиты → NotFound', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        leaseRow({ tenantId: 'tenant1' }),
      );
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
      const lease = await service.acceptInvitation(user, 'inv1');
      expect(lease.tenantId).toBe('tenant1');
      expect(prisma.invitation.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv1', status: InvitationStatus.pending },
        data: { status: InvitationStatus.accepted },
      });
      expect(prisma.lease.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.invitation.updateMany.mock.invocationCallOrder[0],
      );
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
      expect(prisma.lease.updateMany).not.toHaveBeenCalled();
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

    it('проигранный захват договора не меняет приглашение и не уведомляет', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv1',
        leaseId: 'l1',
        invitedEmail: 'tenant@mail.ru',
        status: InvitationStatus.pending,
      });
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        landlordId: 'u1',
        tenantId: null,
      });
      prisma.lease.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.acceptInvitation(user, 'inv1'),
      ).rejects.toMatchObject({
        status: 409,
        message: 'К договору уже привязан арендатор',
      });
      expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('проигранный захват приглашения отклоняет всю транзакцию и не уведомляет', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv1',
        leaseId: 'l1',
        invitedEmail: 'tenant@mail.ru',
        status: InvitationStatus.pending,
      });
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        landlordId: 'u1',
        tenantId: null,
      });
      prisma.invitation.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.acceptInvitation(user, 'inv1'),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Приглашение уже обработано',
      });
      expect(prisma.lease.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.lease.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('declineInvitation', () => {
    it('уведомляет арендодателя', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv1',
        leaseId: 'l1',
        invitedEmail: 'tenant@mail.ru',
        status: InvitationStatus.pending,
      });
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        landlordId: 'u1',
      });

      await service.declineInvitation('tenant@mail.ru', 'inv1');

      expect(notifications.notify).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          type: 'invitation_declined',
          leaseId: 'l1',
        }),
      );
    });

    it('проигранный захват не уведомляет арендодателя', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv1',
        leaseId: 'l1',
        invitedEmail: 'tenant@mail.ru',
        status: InvitationStatus.pending,
      });
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        landlordId: 'u1',
      });
      prisma.invitation.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.declineInvitation('tenant@mail.ru', 'inv1'),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Приглашение уже обработано',
      });
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('getForUser', () => {
    it('посторонний пользователь не видит договор → NotFound', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        leaseRow({ tenantId: 'tenant1' }),
      );
      await expect(
        service.getForUser('stranger', 'l1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('tenant видит договор вместе с объектом и арендодателем', async () => {
      prisma.lease.findUnique.mockResolvedValue(
        leaseRow({
          tenantId: 'tenant1',
          tenant: { id: 'tenant1', fullName: 'Пётр', email: 't@mail.ru' },
          status: LeaseStatus.active,
        }),
      );
      const lease = await service.getForUser('tenant1', 'l1');
      // Адрес приходит вместе с договором — раньше фронт добирал его
      // запросом к properties/:id и получал 404 (ADR-0020).
      expect(lease.property.address).toBe('Москва, Тверская 1');
      expect(lease.landlord.email).toBe('landlord@x.ru');
      expect(lease.tenant?.fullName).toBe('Пётр');
    });

    it('приглашение видит только арендодатель', async () => {
      const row = leaseRow({
        tenantId: 'tenant1',
        status: LeaseStatus.sent,
        invitations: [
          {
            invitedEmail: 'tenant@mail.ru',
            status: 'pending',
            createdAt: new Date('2026-08-20'),
            token: 'pending-token',
          },
        ],
      });
      prisma.lease.findUnique.mockResolvedValue(row);
      const asLandlord = await service.getForUser('u1', 'l1');
      expect(asLandlord.invitation?.invitedEmail).toBe('tenant@mail.ru');
      expect(asLandlord.invitation?.token).toBe('pending-token');

      prisma.lease.findUnique.mockResolvedValue(row);
      const asTenant = await service.getForUser('tenant1', 'l1');
      expect(asTenant.invitation).toBeNull();
    });

    it.each([
      InvitationStatus.accepted,
      InvitationStatus.declined,
      InvitationStatus.cancelled,
    ])('не отдаёт токен собственнику для статуса %s', async (status) => {
      prisma.lease.findUnique.mockResolvedValue(
        leaseRow({
          invitations: [
            {
              invitedEmail: 'tenant@mail.ru',
              status,
              createdAt: new Date('2026-08-20'),
              token: 'stale-token',
            },
          ],
        }),
      );

      const result = await service.getForUser('u1', 'l1');
      expect(result.invitation?.token).toBeNull();
    });
  });

  it('публичный InvitationLinkController не имеет guard metadata', () => {
    expect(Reflect.getMetadata('__guards__', InvitationLinkController)).toBeUndefined();
  });
});
