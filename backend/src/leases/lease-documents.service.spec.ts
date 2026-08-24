import { NotFoundException } from '@nestjs/common';
import { LeaseDocumentsService } from './lease-documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from './leases.service';
import { CryptoService } from '../crypto/crypto.service';

const leaseWithRelations = {
  id: 'l1',
  landlordId: 'landlord1',
  tenantId: 'tenant1',
  startDate: new Date(Date.UTC(2026, 7, 1)), // 1 авг 2026
  endDate: new Date(Date.UTC(2027, 6, 1)), // 1 июл 2027 → 11 месяцев
  rentAmount: 50000,
  depositAmount: 0,
  paymentDay: 20,
  property: {
    address: 'Москва, Тверская 1',
    city: 'Иркутск',
    areaSqm: 42,
    cadastralNumber: '38:36:000021:1234',
  },
  landlord: { fullName: 'Иванов Иван Иванович' },
  tenant: { fullName: 'Петров Пётр Петрович' },
};

const partyInfoData = {
  passportSeries: '4510',
  passportNumber: '123456',
  passportIssuedBy: 'ОУФМС района Тверской г. Москвы',
  birthDate: '1995-05-20',
  registrationAddress: 'Москва, ул. Ленина, д. 5, кв. 10',
  phone: '+79991234567',
};

describe('LeaseDocumentsService', () => {
  let service: LeaseDocumentsService;
  let prisma: any;
  let leases: { getForUser: jest.Mock };
  let crypto: { decrypt: jest.Mock };

  beforeEach(() => {
    prisma = {
      lease: { findUnique: jest.fn() },
      leaseDocument: {
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'd1', ...data })),
      },
      leaseInventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
      leasePartyInfo: { findMany: jest.fn().mockResolvedValue([]) },
    };
    leases = { getForUser: jest.fn() };
    crypto = { decrypt: jest.fn() };
    service = new LeaseDocumentsService(
      prisma as unknown as PrismaService,
      leases as unknown as LeasesService,
      crypto as unknown as CryptoService,
    );
  });

  it('подставляет известные поля и ФИО сторон, паспорт — прочерк, пока не заполнен (ADR-0021)', async () => {
    prisma.lease.findUnique.mockResolvedValue(leaseWithRelations);
    prisma.leaseDocument.findFirst.mockResolvedValue(null);

    const doc = await service.generate('landlord1', 'l1');

    expect(doc.version).toBe(1);
    expect(doc.content).toContain('<b>г. Иркутск</b>');
    expect(doc.content).toContain('Москва, Тверская 1');
    expect(doc.content).toContain('42 кв.м');
    expect(doc.content).toContain('Кадастровый номер: 38:36:000021:1234');
    expect(doc.content).toContain('50000 рублей'); // аренда
    expect(doc.content).toContain('20 числа'); // день оплаты
    expect(doc.content).toContain('11 месяцев'); // срок
    // ФИО сторон подставляется всегда (ADR-0021).
    expect(doc.content).toContain('Иванов Иван Иванович');
    expect(doc.content).toContain('Петров Пётр Петрович');
    // Паспорт не заполнен ни одной из сторон — прочерк.
    expect(doc.content).toContain('Паспорт серии ______');
  });

  it('подставляет паспорт/адрес/телефон стороны, если LeasePartyInfo заполнен (ADR-0021)', async () => {
    prisma.lease.findUnique.mockResolvedValue(leaseWithRelations);
    prisma.leaseDocument.findFirst.mockResolvedValue(null);
    prisma.leasePartyInfo.findMany.mockResolvedValue([
      {
        role: 'tenant',
        dataEnc: 'enc:tenant',
        consentAcceptedAt: new Date('2026-08-20T10:00:00Z'),
        consentPolicyVersion: 'старая-но-действовавшая-версия',
      },
    ]);
    crypto.decrypt.mockReturnValue(JSON.stringify(partyInfoData));

    const doc = await service.generate('landlord1', 'l1');

    expect(crypto.decrypt).toHaveBeenCalledWith('enc:tenant');
    expect(doc.content).toContain('Паспорт серии 4510 № 123456');
    expect(doc.content).toContain('ОУФМС района Тверской г. Москвы');
    expect(doc.content).toContain('Москва, ул. Ленина, д. 5, кв. 10');
    expect(doc.content).toContain('+79991234567');
    expect(doc.content).toContain('Дата рождения: 20.05.1995');
    // Арендодатель ничего не заполнял — у него по-прежнему прочерк.
    expect(doc.content).toContain('Паспорт серии ______');
  });

  it('не подставляет запись без зафиксированного согласия', async () => {
    prisma.lease.findUnique.mockResolvedValue(leaseWithRelations);
    prisma.leaseDocument.findFirst.mockResolvedValue(null);
    const rows = [
      {
        role: 'tenant',
        dataEnc: 'enc:tenant',
        consentAcceptedAt: null,
        consentPolicyVersion: null,
      },
    ];
    prisma.leasePartyInfo.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(
        rows.filter(
          (row) =>
            row.consentAcceptedAt !== null ||
            where.consentAcceptedAt?.not === undefined,
        ),
      ),
    );

    const doc = await service.generate('landlord1', 'l1');

    expect(prisma.leasePartyInfo.findMany).toHaveBeenCalledWith({
      where: { leaseId: 'l1', consentAcceptedAt: { not: null } },
    });
    expect(crypto.decrypt).not.toHaveBeenCalled();
    expect(doc.content).toContain('Дата рождения: __.__.____');
    expect(doc.content).toContain('Паспорт серии ______');
  });

  it('подставляет запись с согласием под устаревшей редакцией', async () => {
    prisma.lease.findUnique.mockResolvedValue(leaseWithRelations);
    prisma.leaseDocument.findFirst.mockResolvedValue(null);
    prisma.leasePartyInfo.findMany.mockResolvedValue([
      {
        role: 'tenant',
        dataEnc: 'enc:tenant',
        consentAcceptedAt: new Date('2026-08-20T10:00:00Z'),
        consentPolicyVersion: 'устаревшая-версия',
      },
    ]);
    crypto.decrypt.mockReturnValue(JSON.stringify(partyInfoData));

    const doc = await service.generate('landlord1', 'l1');

    expect(doc.content).toContain('Паспорт серии 4510 № 123456');
  });

  it('версия инкрементируется', async () => {
    prisma.lease.findUnique.mockResolvedValue(leaseWithRelations);
    prisma.leaseDocument.findFirst.mockResolvedValue({ version: 3 });
    const doc = await service.generate('landlord1', 'l1');
    expect(doc.version).toBe(4);
  });

  it('генерация чужого договора → NotFound', async () => {
    prisma.lease.findUnique.mockResolvedValue(leaseWithRelations);
    await expect(service.generate('stranger', 'l1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([null, ''])(
    'печатает прочерк при пустом кадастровом номере: %p',
    async (cadastralNumber) => {
      prisma.lease.findUnique.mockResolvedValue({
        ...leaseWithRelations,
        property: { ...leaseWithRelations.property, cadastralNumber },
      });
      prisma.leaseDocument.findFirst.mockResolvedValue(null);

      const doc = await service.generate('landlord1', 'l1');

      expect(doc.content).toContain('Кадастровый номер: ____________');
    },
  );

  it.each([null, '', '   '])(
    'печатает прочерк и не падает при пустом городе договора: %p',
    async (city) => {
      prisma.lease.findUnique.mockResolvedValue({
        ...leaseWithRelations,
        property: { ...leaseWithRelations.property, city },
      });
      prisma.leaseDocument.findFirst.mockResolvedValue(null);

      const doc = await service.generate('landlord1', 'l1');

      expect(doc.content).toContain('<b>г. ____________</b>');
    },
  );

  it('нет сгенерированного текста → NotFound при getLatest', async () => {
    leases.getForUser.mockResolvedValue(leaseWithRelations);
    prisma.leaseDocument.findFirst.mockResolvedValue(null);
    await expect(service.getLatest('landlord1', 'l1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('акт приёма-передачи имущества (Приложение №1, ADR-0018)', () => {
    it('рендерит опись из LeaseInventoryItem, без персональных данных', async () => {
      prisma.lease.findUnique.mockResolvedValue(leaseWithRelations);
      prisma.leaseDocument.findFirst.mockResolvedValue(null);
      prisma.leaseInventoryItem.findMany.mockResolvedValue([
        { type: 'Холодильник', brand: 'Bosch', model: 'KGN39', quantity: 1 },
        { type: 'Стул', brand: null, model: null, quantity: 4 },
      ]);

      const doc = await service.generateHandoverAct('landlord1', 'l1');

      expect(doc.version).toBe(1);
      expect(doc.content).toContain('Приложение №1');
      expect(doc.content).toContain('<b>г. Иркутск</b>');
      expect(doc.content).toContain('Москва, Тверская 1');
      expect(doc.content).toContain('Холодильник');
      expect(doc.content).toContain('Bosch');
      expect(doc.content).toContain('Стул');
      expect(doc.content).not.toContain('Иванов');
    });

    it('версия акта считается отдельно от версии договора', async () => {
      prisma.lease.findUnique.mockResolvedValue(leaseWithRelations);
      // И договор, и акт уже на версии 2 — вызовы findFirst различаются
      // только фильтром kind, здесь для простоты оба возвращают одно и то же.
      prisma.leaseDocument.findFirst.mockResolvedValue({ version: 2 });

      const contractDoc = await service.generate('landlord1', 'l1');
      const actDoc = await service.generateHandoverAct('landlord1', 'l1');

      expect(contractDoc.version).toBe(3);
      expect(actDoc.version).toBe(3);
      expect(prisma.leaseDocument.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ data: expect.objectContaining({ kind: 'contract' }) }),
      );
      expect(prisma.leaseDocument.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ data: expect.objectContaining({ kind: 'handover_act' }) }),
      );
    });

    it('пустая опись → акт с пометкой, без ошибки', async () => {
      prisma.lease.findUnique.mockResolvedValue(leaseWithRelations);
      prisma.leaseDocument.findFirst.mockResolvedValue(null);
      prisma.leaseInventoryItem.findMany.mockResolvedValue([]);

      const doc = await service.generateHandoverAct('landlord1', 'l1');
      expect(doc.content).toContain('Опись пуста');
    });

    it('при пустом городе печатает прочерк и не падает', async () => {
      prisma.lease.findUnique.mockResolvedValue({
        ...leaseWithRelations,
        property: { ...leaseWithRelations.property, city: null },
      });
      prisma.leaseDocument.findFirst.mockResolvedValue(null);

      const doc = await service.generateHandoverAct('landlord1', 'l1');

      expect(doc.content).toContain('<b>г. ____________</b>');
    });

    it('акт чужого договора → NotFound', async () => {
      prisma.lease.findUnique.mockResolvedValue(leaseWithRelations);
      await expect(
        service.generateHandoverAct('stranger', 'l1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('нет сгенерированного акта → NotFound при getLatestHandoverAct', async () => {
      leases.getForUser.mockResolvedValue(leaseWithRelations);
      prisma.leaseDocument.findFirst.mockResolvedValue(null);
      await expect(
        service.getLatestHandoverAct('landlord1', 'l1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
