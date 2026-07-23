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
  let billing: { addUtilityLine: jest.Mock };

  beforeEach(() => {
    prisma = {
      meter: { findUnique: jest.fn() },
      lease: { findFirst: jest.fn() },
      meterReading: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    };
    storage = { put: jest.fn(), get: jest.fn(), delete: jest.fn(), getUrl: jest.fn() };
    ocr = { recognize: jest.fn().mockResolvedValue(null) };
    billing = { addUtilityLine: jest.fn() };
    service = new MeterReadingsService(
      prisma as unknown as PrismaService,
      storage,
      ocr,
      billing as unknown as BillingService,
    );
  });

  function meter(tariff = 5) {
    return { id: 'm1', propertyId: 'p1', name: 'Электро', tariff };
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
    );
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
});
