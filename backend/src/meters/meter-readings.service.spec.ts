import { BadRequestException, ConflictException } from '@nestjs/common';
import { LeaseStatus } from '@prisma/client';
import { MeterReadingsService } from './meter-readings.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageProvider } from '../storage/storage-provider.interface';
import { MeterOcrProvider } from '../ocr/meter-ocr-provider.interface';
import { BillingService } from '../billing/billing.service';

const photo = { buffer: Buffer.from('img'), mimetype: 'image/jpeg' };
const activeLease = {
  id: 'l1',
  propertyId: 'p1',
  landlordId: 'landlord1',
  tenantId: 'tenant1',
  status: LeaseStatus.active,
};

describe('MeterReadingsService', () => {
  let service: MeterReadingsService;
  let prisma: any;
  let storage: jest.Mocked<StorageProvider>;
  let ocr: jest.Mocked<MeterOcrProvider>;
  let billing: { ensureCurrentDraft: jest.Mock; addUtilityLine: jest.Mock };

  beforeEach(() => {
    prisma = {
      meter: { findUnique: jest.fn() },
      lease: { findFirst: jest.fn() },
      meterReading: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    storage = { put: jest.fn(), get: jest.fn(), delete: jest.fn(), getUrl: jest.fn() };
    ocr = { recognize: jest.fn().mockResolvedValue(null) };
    billing = {
      ensureCurrentDraft: jest.fn().mockResolvedValue(undefined),
      addUtilityLine: jest.fn(),
    };
    service = new MeterReadingsService(
      prisma as unknown as PrismaService,
      storage,
      ocr,
      billing as unknown as BillingService,
    );
  });

  function meter(tariff = 5, extra: Record<string, unknown> = {}) {
    return {
      id: 'm1',
      propertyId: 'p1',
      name: 'Электро',
      tariff,
      isActive: true,
      initialReading: 0,
      ...extra,
    };
  }

  it('отклоняет не-JPEG/PNG фото', async () => {
    await expect(
      service.create('tenant1', 'm1', 100, {
        buffer: Buffer.from('x'),
        mimetype: 'application/pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('нет активного договора → Conflict', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter());
    prisma.lease.findFirst.mockResolvedValue(null);
    await expect(
      service.create('tenant1', 'm1', 100, photo),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('отключённый счётчик не принимает показания → Conflict', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter(5, { isActive: false }));
    await expect(
      service.create('tenant1', 'm1', 100, photo),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.meterReading.create).not.toHaveBeenCalled();
  });

  it('первое показание без истории считает расход от initialReading, а не от 0 (ADR-0014)', async () => {
    prisma.meter.findUnique.mockResolvedValue(
      meter(5, { initialReading: 100 }),
    );
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    prisma.meterReading.findMany.mockResolvedValue([]);
    prisma.meterReading.create.mockResolvedValue({ id: 'r0' });

    const res = await service.create('tenant1', 'm1', 150, photo);

    expect(res.consumption).toBe(50);
    expect(res.cost).toBe(250);
  });

  it('новое значение меньше предыдущего → BadRequest', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter());
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    prisma.meterReading.findMany.mockResolvedValue([{ value: 200 }]);
    await expect(
      service.create('tenant1', 'm1', 100, photo),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('сохраняет показание, фото и добавляет коммунальную строку', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter(5));
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    prisma.meterReading.findMany.mockResolvedValue([{ value: 100 }]);
    prisma.meterReading.create.mockResolvedValue({ id: 'r1' });

    const res = await service.create('tenant1', 'm1', 150, photo);

    expect(storage.put).toHaveBeenCalled();
    expect(ocr.recognize).toHaveBeenCalledWith(photo.buffer);
    expect(res.consumption).toBe(50);
    expect(res.cost).toBe(250); // 50 * 5
    expect(billing.addUtilityLine).toHaveBeenCalledWith(
      activeLease,
      expect.objectContaining({ amount: 250, sourceRefId: 'r1' }),
      prisma,
    );
    expect(billing.ensureCurrentDraft).toHaveBeenCalledWith(activeLease);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('мягко предупреждает при расходе >10× среднего, но сохраняет', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter(5));
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    // Средний расход = 10 (0→10→20). Новый расход 20−... : прошлое значение 20,
    // новое 500 → расход 480 > 10*10=100.
    prisma.meterReading.findMany.mockResolvedValue([
      { value: 0 },
      { value: 10 },
      { value: 20 },
    ]);
    prisma.meterReading.create.mockResolvedValue({ id: 'r2' });

    const res = await service.create('tenant1', 'm1', 500, photo);
    expect(res.warning).toMatch(/10 раз/);
    expect(prisma.meterReading.create).toHaveBeenCalled(); // не блокирует
  });

  it('не сторона договора → 404 (NotFound)', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter());
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    await expect(
      service.create('stranger', 'm1', 100, photo),
    ).rejects.toThrow();
  });

  it('listForMeter отдаёт историю landlord/tenant, scoped на текущий договор (ADR-0015)', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter());
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    prisma.meterReading.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);

    const result = await service.listForMeter('tenant1', 'm1');

    expect(result).toHaveLength(2);
    expect(prisma.meterReading.findMany.mock.calls[0][0].where).toEqual({
      meterId: 'm1',
      leaseId: 'l1',
    });
  });

  it('listForMeter: не сторона договора → 404', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter());
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    await expect(
      service.listForMeter('stranger', 'm1'),
    ).rejects.toThrow();
  });

  it('readingDate в будущем → BadRequest', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await expect(
      service.create('tenant1', 'm1', 100, photo, tomorrow),
    ).rejects.toThrow('Дата показания не может быть в будущем');
    expect(prisma.meter.findUnique).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('второе показание в периоде создаёт вторую строку без двойного начисления', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter(5));
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    prisma.meterReading.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ value: 100 }]);
    prisma.meterReading.create
      .mockResolvedValueOnce({ id: 'r1' })
      .mockResolvedValueOnce({ id: 'r2' });

    const first = await service.create('tenant1', 'm1', 100, photo);
    const second = await service.create('tenant1', 'm1', 150, photo);

    expect(first.consumption).toBe(100);
    expect(second.consumption).toBe(50);
    const lineAmounts = billing.addUtilityLine.mock.calls.map(
      (call) => call[1].amount,
    );
    expect(lineAmounts).toEqual([500, 250]);
    expect(lineAmounts.reduce((sum, amount) => sum + amount, 0)).toBe(750);
  });

  it('сбой строки расхода откатывает создание показания той же транзакцией', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter(5));
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    let persisted = false;
    const tx = {
      meterReading: {
        create: jest.fn().mockImplementation(async () => {
          persisted = true;
          return { id: 'r1' };
        }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => {
        try {
          return await callback(tx);
        } catch (error) {
          persisted = false;
          throw error;
        }
      },
    );
    billing.addUtilityLine.mockRejectedValue(new Error('line failed'));

    await expect(
      service.create('tenant1', 'm1', 100, photo),
    ).rejects.toThrow('line failed');
    expect(persisted).toBe(false);
    expect(billing.addUtilityLine).toHaveBeenCalledWith(
      activeLease,
      expect.objectContaining({ sourceRefId: 'r1' }),
      tx,
    );
  });
});
