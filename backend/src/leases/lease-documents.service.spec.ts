import { NotFoundException } from '@nestjs/common';
import { LeaseDocumentsService } from './lease-documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from './leases.service';

const leaseWithRelations = {
  id: 'l1',
  landlordId: 'landlord1',
  startDate: new Date(Date.UTC(2026, 7, 1)), // 1 авг 2026
  endDate: new Date(Date.UTC(2027, 6, 1)), // 1 июл 2027 → 11 месяцев
  rentAmount: 50000,
  depositAmount: 0,
  paymentDay: 20,
  property: { address: 'Москва, Тверская 1', areaSqm: 42 },
};

describe('LeaseDocumentsService', () => {
  let service: LeaseDocumentsService;
  let prisma: any;
  let leases: { getForUser: jest.Mock };

  beforeEach(() => {
    prisma = {
      lease: { findUnique: jest.fn() },
      leaseDocument: {
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'd1', ...data })),
      },
      leaseInventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    leases = { getForUser: jest.fn() };
    service = new LeaseDocumentsService(
      prisma as unknown as PrismaService,
      leases as unknown as LeasesService,
    );
  });

  it('подставляет известные поля и оставляет прочерки для ПДн (ADR-0017)', async () => {
    prisma.lease.findUnique.mockResolvedValue(leaseWithRelations);
    prisma.leaseDocument.findFirst.mockResolvedValue(null);

    const doc = await service.generate('landlord1', 'l1');

    expect(doc.version).toBe(1);
    expect(doc.content).toContain('Москва, Тверская 1');
    expect(doc.content).toContain('42 кв.м');
    expect(doc.content).toContain('50000 рублей'); // аренда
    expect(doc.content).toContain('20 числа'); // день оплаты
    expect(doc.content).toContain('11 месяцев'); // срок
    // ФИО и паспорт сервис не подставляет — только прочерки от руки.
    expect(doc.content).not.toContain('Иванов Иван Иванович');
    expect(doc.content).not.toContain('Петров Пётр Петрович');
    expect(doc.content).toContain('Паспорт серии');
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
