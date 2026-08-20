import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LeaseParty, LeaseStatus } from '@prisma/client';
import { PartyInfoService, parseBirthDate } from './party-info.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PartyInfoDto, SavePartyInfoDto } from './dto/party-info.dto';
import { PRIVACY_POLICY_VERSION } from '../legal/privacy-policy.const';

type PrismaMock = {
  lease: { findUnique: jest.Mock; findMany: jest.Mock };
  leasePartyInfo: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };
};

const lease = {
  id: 'l1',
  landlordId: 'landlord1',
  tenantId: 'tenant1',
  status: LeaseStatus.active,
  property: { address: 'Москва, Тверская 1' },
};

const dto: PartyInfoDto = {
  passportSeries: '4510',
  passportNumber: '123456',
  passportIssuedBy: 'ОУФМС района Тверской г. Москвы',
  birthDate: '1995-05-20',
  registrationAddress: 'Москва, ул. Ленина, д. 5, кв. 10',
  phone: '+79991234567',
};

const firstSave: SavePartyInfoDto = {
  ...dto,
  consentAccepted: true,
  policyVersion: PRIVACY_POLICY_VERSION,
};

function storedInfo(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    dataEnc: 'enc:existing',
    consentAcceptedAt: new Date('2026-08-20T10:00:00Z'),
    consentPolicyVersion: PRIVACY_POLICY_VERSION,
    updatedAt: new Date('2026-08-20T10:00:00Z'),
    ...overrides,
  };
}

describe('PartyInfoService', () => {
  let service: PartyInfoService;
  let prisma: PrismaMock;
  let crypto: jest.Mocked<Pick<CryptoService, 'encrypt' | 'decrypt'>>;
  let notifications: jest.Mocked<Pick<NotificationsService, 'notify'>>;

  beforeEach(() => {
    prisma = {
      lease: { findUnique: jest.fn(), findMany: jest.fn() },
      leasePartyInfo: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    crypto = {
      encrypt: jest.fn().mockReturnValue('enc:new'),
      decrypt: jest.fn(),
    };
    notifications = { notify: jest.fn().mockResolvedValue({}) };
    service = new PartyInfoService(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
      notifications as unknown as NotificationsService,
    );
  });

  it('арендодатель вносит свои данные — роль определяется по landlordId', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);

    const res = await service.upsert('landlord1', 'l1', firstSave);

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

    const res = await service.upsert('tenant1', 'l1', firstSave);

    expect(res).toEqual({ leaseId: 'l1', role: LeaseParty.tenant });
  });

  it('посторонний пользователь → NotFound (не подменить роль)', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    await expect(
      service.upsert('stranger', 'l1', firstSave),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('читает свою запись и расшифровывает её', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    prisma.leasePartyInfo.findUnique.mockResolvedValue(storedInfo());
    crypto.decrypt.mockReturnValue(JSON.stringify(dto));

    const res = await service.getOwn('tenant1', 'l1');

    expect(crypto.decrypt).toHaveBeenCalledWith('enc:existing');
    expect(res).toEqual({
      ...dto,
      consentAcceptedAt: '2026-08-20T10:00:00.000Z',
      consentPolicyVersion: PRIVACY_POLICY_VERSION,
      currentPolicyVersion: PRIVACY_POLICY_VERSION,
      updatedAt: '2026-08-20T10:00:00.000Z',
    });
  });

  it('нет своей записи → NotFound', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    await expect(service.getOwn('tenant1', 'l1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('SuperAdmin читает любую сторону по роли напрямую', async () => {
    prisma.leasePartyInfo.findUnique.mockResolvedValue(storedInfo());
    crypto.decrypt.mockReturnValue(JSON.stringify(dto));

    const res = await service.getAsSuperAdmin('l1', LeaseParty.landlord);

    expect(prisma.leasePartyInfo.findUnique).toHaveBeenCalledWith({
      where: { leaseId_role: { leaseId: 'l1', role: LeaseParty.landlord } },
    });
    expect(res.passportNumber).toBe(dto.passportNumber);
    expect(res.consentAcceptedAt).toBe('2026-08-20T10:00:00.000Z');
  });

  it('запрещает изменение данных расторгнутого договора', async () => {
    prisma.lease.findUnique.mockResolvedValue({
      ...lease,
      status: LeaseStatus.terminated,
    });

    await expect(
      service.upsert('landlord1', 'l1', firstSave),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.leasePartyInfo.upsert).not.toHaveBeenCalled();
  });

  it('требует согласие при первом сохранении', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);

    await expect(service.upsert('landlord1', 'l1', dto)).rejects.toThrow(
      new BadRequestException(
        'Нужно согласие на обработку персональных данных',
      ),
    );
  });

  it('отклоняет согласие под чужой версией политики', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);

    await expect(
      service.upsert('landlord1', 'l1', {
        ...dto,
        consentAccepted: true,
        policyVersion: 'чужая-версия',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('при первом сохранении фиксирует дату и текущую версию согласия', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);

    await service.upsert('landlord1', 'l1', firstSave);

    expect(prisma.leasePartyInfo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          consentAcceptedAt: expect.any(Date),
          consentPolicyVersion: PRIVACY_POLICY_VERSION,
        }),
      }),
    );
  });

  it('изменяет данные при актуальном согласии без новой галочки и не затирает его дату', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    prisma.leasePartyInfo.findUnique.mockResolvedValue(storedInfo());
    crypto.decrypt.mockReturnValue(JSON.stringify(dto));

    await service.upsert('landlord1', 'l1', {
      ...dto,
      registrationAddress: 'Москва, ул. Новая, д. 7, кв. 1',
    });

    const update = prisma.leasePartyInfo.upsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty('consentAcceptedAt');
    expect(update).not.toHaveProperty('consentPolicyVersion');
  });

  it('при устаревшей версии политики снова требует согласие', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    prisma.leasePartyInfo.findUnique.mockResolvedValue(
      storedInfo({ consentPolicyVersion: '2026-01-01+old' }),
    );

    await expect(service.upsert('landlord1', 'l1', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('битая строка с текущей версией, но без даты, всё равно требует согласие', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    prisma.leasePartyInfo.findUnique.mockResolvedValue(
      storedInfo({ consentAcceptedAt: null }),
    );

    await expect(service.upsert('landlord1', 'l1', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('не записывает и не уведомляет при повторном сохранении тех же данных', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    prisma.leasePartyInfo.findUnique.mockResolvedValue(storedInfo());
    crypto.decrypt.mockReturnValue(JSON.stringify(dto));

    const res = await service.upsert('landlord1', 'l1', dto);

    expect(res).toEqual({ leaseId: 'l1', role: LeaseParty.landlord });
    expect(prisma.leasePartyInfo.upsert).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('не шифрует поля согласия вместе с персональными данными', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);

    await service.upsert('landlord1', 'l1', firstSave);

    const encrypted = crypto.encrypt.mock.calls[0][0];
    expect(JSON.parse(encrypted)).toEqual(dto);
    expect(encrypted).not.toContain('consentAccepted');
    expect(encrypted).not.toContain('policyVersion');
  });

  it('после очистки телефона ключ отсутствует в шифруемом payload', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    prisma.leasePartyInfo.findUnique.mockResolvedValue(storedInfo());
    crypto.decrypt.mockReturnValue(JSON.stringify(dto));

    await service.upsert('landlord1', 'l1', { ...dto, phone: undefined });

    expect(JSON.parse(crypto.encrypt.mock.calls[0][0])).not.toHaveProperty(
      'phone',
    );
  });

  it('уведомляет арендатора, когда собственник изменил данные', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);

    await service.upsert('landlord1', 'l1', firstSave);

    expect(notifications.notify).toHaveBeenCalledWith(
      'tenant1',
      expect.objectContaining({
        type: 'party_info_submitted',
        title: 'Собственник внёс персональные данные',
      }),
    );
  });

  it('уведомляет собственника с напоминанием перегенерировать договор', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);

    await service.upsert('tenant1', 'l1', firstSave);

    expect(notifications.notify).toHaveBeenCalledWith(
      'landlord1',
      expect.objectContaining({
        title: 'Арендатор внёс персональные данные',
        body: expect.stringContaining('перегенерируйте'),
      }),
    );
  });

  it('сбой уведомления не ломает уже выполненное сохранение', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    notifications.notify.mockRejectedValue(new Error('channel unavailable'));

    await expect(
      service.upsert('landlord1', 'l1', firstSave),
    ).resolves.toEqual({ leaseId: 'l1', role: LeaseParty.landlord });
    expect(prisma.leasePartyInfo.upsert).toHaveBeenCalled();
  });

  it('не уведомляет, пока вторая сторона не привязана', async () => {
    prisma.lease.findUnique.mockResolvedValue({ ...lease, tenantId: null });

    await service.upsert('landlord1', 'l1', firstSave);

    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('устаревшее согласие не скрывает ранее введённые данные', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    prisma.leasePartyInfo.findUnique.mockResolvedValue(
      storedInfo({ consentPolicyVersion: 'старая-версия' }),
    );
    crypto.decrypt.mockReturnValue(JSON.stringify(dto));

    const own = await service.getOwn('tenant1', 'l1');

    expect(own.passportSeries).toBe('4510');
    expect(own.consentPolicyVersion).toBe('старая-версия');
  });

  it('getStatus отдаёт минимум по сторонам, считает needsConsent и не расшифровывает ПДн', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    prisma.leasePartyInfo.findMany.mockResolvedValue([
      {
        role: LeaseParty.landlord,
        updatedAt: new Date('2026-08-20T10:00:00Z'),
        consentAcceptedAt: new Date('2026-08-20T09:00:00Z'),
        consentPolicyVersion: 'старая-версия',
      },
      {
        role: LeaseParty.tenant,
        updatedAt: new Date('2026-08-20T11:00:00Z'),
        consentAcceptedAt: new Date('2026-08-20T09:30:00Z'),
        consentPolicyVersion: PRIVACY_POLICY_VERSION,
      },
    ]);

    const status = await service.getStatus('landlord1', 'l1');

    expect(status).toEqual({
      role: LeaseParty.landlord,
      currentPolicyVersion: PRIVACY_POLICY_VERSION,
      self: {
        filled: true,
        updatedAt: '2026-08-20T10:00:00.000Z',
        needsConsent: true,
      },
      counterparty: {
        filled: true,
        updatedAt: '2026-08-20T11:00:00.000Z',
      },
    });
    expect(crypto.decrypt).not.toHaveBeenCalled();
  });

  it('getStatus считает строку без даты согласия незаполненной', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);
    prisma.leasePartyInfo.findMany.mockResolvedValue([
      {
        role: LeaseParty.landlord,
        updatedAt: new Date('2026-08-20T10:00:00Z'),
        consentAcceptedAt: null,
        consentPolicyVersion: PRIVACY_POLICY_VERSION,
      },
    ]);

    const status = await service.getStatus('landlord1', 'l1');

    expect(status.self).toEqual({
      filled: false,
      updatedAt: '2026-08-20T10:00:00.000Z',
      needsConsent: true,
    });
    expect(status.counterparty).toEqual({ filled: false, updatedAt: null });
  });

  it('getStatus для не-стороны → NotFound', async () => {
    prisma.lease.findUnique.mockResolvedValue(lease);

    await expect(service.getStatus('stranger', 'l1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.leasePartyInfo.findMany).not.toHaveBeenCalled();
  });

  describe('проверка даты рождения', () => {
    const now = new Date('2026-08-20T12:00:00Z');

    it.each(['2027-01-01', '2025-02-31'])(
      '%s → неверная дата',
      (value) => {
        expect(() => parseBirthDate(value, now)).toThrow(BadRequestException);
      },
    );

    it('принимает существующее 29 февраля', () => {
      expect(parseBirthDate('2000-02-29', now)).toEqual({
        y: 2000,
        m: 2,
        d: 29,
      });
    });

    it('принимает ровно 18 лет и отклоняет 17 лет 364 дня', () => {
      expect(() => parseBirthDate('2008-08-20', now)).not.toThrow();
      expect(() => parseBirthDate('2008-08-21', now)).toThrow(
        'Сторона договора должна быть совершеннолетней',
      );
    });

    it('принимает ровно 120 лет и отклоняет 121 год', () => {
      expect(() => parseBirthDate('1906-08-20', now)).not.toThrow();
      expect(() => parseBirthDate('1905-08-20', now)).toThrow(
        BadRequestException,
      );
    });
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
          endDate: new Date('2029-06-01T00:00:00Z'),
          effectiveEndDate: new Date('2026-01-01T00:00:00Z'),
          maintenanceRequests: [],
        },
      ]);
      prisma.leasePartyInfo.deleteMany.mockResolvedValue({ count: 1 });

      const res = await service.runRetention(now);

      expect(res).toEqual({ deleted: 1 });
    });
  });
});
