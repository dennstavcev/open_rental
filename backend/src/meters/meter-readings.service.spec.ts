import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LeaseStatus } from '@prisma/client';
import { MeterReadingsService } from './meter-readings.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageProvider } from '../storage/storage-provider.interface';
import { MeterOcrProvider } from '../ocr/meter-ocr-provider.interface';
import { BillingService } from '../billing/billing.service';
import { LeasesService } from '../leases/leases.service';

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
  let leases: { getForUser: jest.Mock };

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
    leases = { getForUser: jest.fn() };
    service = new MeterReadingsService(
      prisma as unknown as PrismaService,
      storage,
      ocr,
      billing as unknown as BillingService,
      leases as unknown as LeasesService,
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
    expect(res.requiresConfirmation).toBeUndefined();
    expect(billing.addUtilityLine).toHaveBeenCalledWith(
      activeLease,
      expect.objectContaining({ amount: 250, sourceRefId: 'r1' }),
      prisma,
    );
    expect(billing.ensureCurrentDraft).toHaveBeenCalledWith(activeLease);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('аномалия без подтверждения требует второй шаг и ничего не сохраняет', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter(5));
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    prisma.meterReading.findMany.mockResolvedValue([
      { value: 0 },
      { value: 10 },
      { value: 20 },
    ]);

    const res = await service.create('tenant1', 'm1', 500, photo);

    expect(res).toEqual({
      requiresConfirmation: true,
      consumption: 480,
      cost: 2400,
      previousValue: 20,
      warning: expect.stringMatching(/10 раз/),
    });
    expect(storage.put).not.toHaveBeenCalled();
    expect(ocr.recognize).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(billing.ensureCurrentDraft).not.toHaveBeenCalled();
    expect(billing.addUtilityLine).not.toHaveBeenCalled();
  });

  it('аномалия с подтверждением и совпавшей базой сохраняется', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter(5));
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    prisma.meterReading.findMany.mockResolvedValue([
      { value: 0 },
      { value: 10 },
      { value: 20 },
    ]);
    prisma.meterReading.create.mockResolvedValue({ id: 'r2' });

    const res = await service.create(
      'tenant1',
      'm1',
      500,
      photo,
      undefined,
      true,
      20,
    );

    expect(res.requiresConfirmation).toBeUndefined();
    expect(res.warning).toMatch(/10 раз/);
    expect(prisma.meterReading.create).toHaveBeenCalled();
    expect(billing.addUtilityLine).toHaveBeenCalled();
  });

  it('подтверждение не обходит проверку значения меньше предыдущего', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter());
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    prisma.meterReading.findMany.mockResolvedValue([{ value: 200 }]);

    await expect(
      service.create('tenant1', 'm1', 100, photo, undefined, true, 200),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('подтверждение не обходит запрет отключённого счётчика', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter(5, { isActive: false }));

    await expect(
      service.create('tenant1', 'm1', 100, photo, undefined, true, 0),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('подтверждение без исходного значения отклоняется без сохранения', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter(5));
    prisma.lease.findFirst.mockResolvedValue(activeLease);

    await expect(
      service.create('tenant1', 'm1', 500, photo, undefined, true),
    ).rejects.toThrow('Подтверждение без исходного значения');
    expect(storage.put).not.toHaveBeenCalled();
    expect(ocr.recognize).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(billing.ensureCurrentDraft).not.toHaveBeenCalled();
  });

  it('при изменившейся базе и сохранившейся аномалии возвращает новые числа', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter(5));
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    prisma.meterReading.findMany.mockResolvedValue([
      { value: 0 },
      { value: 10 },
      { value: 20 },
      { value: 30 },
    ]);

    const res = await service.create(
      'tenant1',
      'm1',
      500,
      photo,
      undefined,
      true,
      20,
    );

    expect(res).toEqual({
      requiresConfirmation: true,
      consumption: 470,
      cost: 2350,
      previousValue: 30,
      warning: expect.stringMatching(/10 раз/),
    });
    expect(storage.put).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('при изменившейся базе и исчезнувшей аномалии требует проверить новые числа', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter(5));
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    prisma.meterReading.findMany.mockResolvedValue([
      { value: 0 },
      { value: 10 },
      { value: 20 },
      { value: 390 },
    ]);

    const res = await service.create(
      'tenant1',
      'm1',
      500,
      photo,
      undefined,
      true,
      20,
    );

    expect(res).toEqual({
      requiresConfirmation: true,
      consumption: 110,
      cost: 550,
      previousValue: 390,
      warning: null,
    });
    expect(storage.put).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('при базе выше введённого значения возвращает обычную ошибку', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter(5));
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    prisma.meterReading.findMany.mockResolvedValue([
      { value: 0 },
      { value: 10 },
      { value: 20 },
      { value: 600 },
    ]);

    await expect(
      service.create('tenant1', 'm1', 500, photo, undefined, true, 20),
    ).rejects.toThrow('Новое показание не может быть меньше предыдущего');
    expect(storage.put).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('не сторона договора → 404 (NotFound)', async () => {
    prisma.meter.findUnique.mockResolvedValue(meter());
    prisma.lease.findFirst.mockResolvedValue(activeLease);
    await expect(
      service.create('stranger', 'm1', 100, photo, undefined, true, 0),
    ).rejects.toThrow();
  });

  it('listForLeaseMeter отдаёт собственнику историю завершённого договора', async () => {
    leases.getForUser.mockResolvedValue({
      ...activeLease,
      status: LeaseStatus.terminated,
    });
    prisma.meter.findUnique.mockResolvedValue(meter());
    prisma.meterReading.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);

    const result = await service.listForLeaseMeter('landlord1', 'l1', 'm1');

    expect(result).toHaveLength(2);
    expect(prisma.meterReading.findMany).toHaveBeenCalledWith({
      where: { meterId: 'm1', leaseId: 'l1' },
      orderBy: { readingDate: 'desc' },
    });
  });

  it('listForLeaseMeter отдаёт бывшему арендатору историю его договора', async () => {
    leases.getForUser.mockResolvedValue({
      ...activeLease,
      status: LeaseStatus.terminated,
    });
    prisma.meter.findUnique.mockResolvedValue(meter());
    prisma.meterReading.findMany.mockResolvedValue([{ id: 'r1' }]);

    await expect(
      service.listForLeaseMeter('tenant1', 'l1', 'm1'),
    ).resolves.toEqual([{ id: 'r1' }]);
  });

  it('listForLeaseMeter не принимает счётчик чужого объекта', async () => {
    leases.getForUser.mockResolvedValue(activeLease);
    prisma.meter.findUnique.mockResolvedValue(meter(5, { propertyId: 'p2' }));

    await expect(
      service.listForLeaseMeter('tenant1', 'l1', 'm1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.meterReading.findMany).not.toHaveBeenCalled();
  });

  it('listForLeaseMeter пробрасывает 404 для пользователя не из договора', async () => {
    leases.getForUser.mockRejectedValue(
      new NotFoundException('Договор не найден'),
    );

    await expect(
      service.listForLeaseMeter('stranger', 'l1', 'm1'),
    ).rejects.toThrow('Договор не найден');
    expect(prisma.meter.findUnique).not.toHaveBeenCalled();
  });

  it('listForLeaseMeter возвращает 404 для несуществующего счётчика', async () => {
    leases.getForUser.mockResolvedValue(activeLease);
    prisma.meter.findUnique.mockResolvedValue(null);

    await expect(
      service.listForLeaseMeter('tenant1', 'l1', 'missing'),
    ).rejects.toThrow('Счётчик не найден');
  });

  it('listForLeaseMeter отдаёт историю отключённого счётчика', async () => {
    leases.getForUser.mockResolvedValue(activeLease);
    prisma.meter.findUnique.mockResolvedValue(meter(5, { isActive: false }));
    prisma.meterReading.findMany.mockResolvedValue([{ id: 'r1' }]);

    await expect(
      service.listForLeaseMeter('tenant1', 'l1', 'm1'),
    ).resolves.toEqual([{ id: 'r1' }]);
  });

  it('listForLeaseMeter не смешивает показания последовательных договоров', async () => {
    leases.getForUser.mockResolvedValue({ ...activeLease, id: 'l2' });
    prisma.meter.findUnique.mockResolvedValue(meter());
    prisma.meterReading.findMany.mockImplementation(
      ({ where }: { where: { leaseId: string } }) =>
      Promise.resolve(
        [{ id: 'r1', leaseId: 'l1' }, { id: 'r2', leaseId: 'l2' }].filter(
          (reading) => reading.leaseId === where.leaseId,
        ),
      ),
    );

    await expect(
      service.listForLeaseMeter('tenant2', 'l2', 'm1'),
    ).resolves.toEqual([{ id: 'r2', leaseId: 'l2' }]);
  });

  it('readingDate в будущем → BadRequest', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await expect(
      service.create('tenant1', 'm1', 100, photo, tomorrow, true, 0),
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
