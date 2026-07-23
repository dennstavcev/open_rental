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
  landlord: { fullName: 'Иванов Иван Иванович' },
  tenant: { fullName: 'Петров Пётр Петрович' },
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
    };
    leases = { getForUser: jest.fn() };
    service = new LeaseDocumentsService(
      prisma as unknown as PrismaService,
      leases as unknown as LeasesService,
    );
  });

  it('подставляет известные поля и оставляет прочерки для ПДн', async () => {
    prisma.lease.findUnique.mockResolvedValue(leaseWithRelations);
    prisma.leaseDocument.findFirst.mockResolvedValue(null);

    const doc = await service.generate('landlord1', 'l1');

    expect(doc.version).toBe(1);
    expect(doc.content).toContain('Иванов Иван Иванович');
    expect(doc.content).toContain('Петров Пётр Петрович');
    expect(doc.content).toContain('Москва, Тверская 1');
    expect(doc.content).toContain('42 кв.м');
    expect(doc.content).toContain('50000 рублей'); // аренда
    expect(doc.content).toContain('20 числа'); // день оплаты
    expect(doc.content).toContain('11 месяцев'); // срок
    // Паспорт остаётся прочерком.
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
});
