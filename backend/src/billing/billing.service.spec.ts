import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  BillItemKind,
  BillItemSource,
  BillPaymentStatus,
  BillStage,
  LeaseStatus,
  Prisma,
  ServiceType,
  SettlementPayer,
} from '@prisma/client';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from '../leases/leases.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageProvider } from '../storage/storage-provider.interface';

const LANDLORD = 'landlord1';
const TENANT = 'tenant1';

function makeBill(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    leaseId: 'l1',
    stage: BillStage.draft,
    paymentStatus: null,
    periodStart: new Date(Date.UTC(2026, 8, 20, 12, 0, 0)),
    periodEnd: new Date(Date.UTC(2026, 9, 20, 12, 0, 0)),
    dueDate: new Date(Date.UTC(2026, 9, 20, 12, 0, 0)),
    penaltyRatePercentPerDay: 0.1,
    penaltyWaived: false,
    penaltyWaivedAmount: null,
    readingsOverdueAlertedAt: null,
    readingsMissingAlertedAt: null,
    lineItems: [{ amount: 50000 }],
    payment: null,
    paymentProof: null,
    lease: {
      id: 'l1',
      propertyId: 'p1',
      landlordId: LANDLORD,
      tenantId: TENANT,
      paymentDay: 20,
      rentAmount: 50000,
      penaltyRatePercentPerDay: 0.1,
      status: LeaseStatus.active,
    },
    ...overrides,
  };
}

describe('BillingService', () => {
  let service: BillingService;
  let prisma: any;
  let leases: { getForUser: jest.Mock };
  let notifications: { notify: jest.Mock };
  let storage: {
    put: jest.Mock;
    get: jest.Mock;
    delete: jest.Mock;
    getUrl: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      bill: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'b-next' }),
      },
      billLineItem: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      payment: { create: jest.fn().mockResolvedValue({}) },
      paymentProof: { upsert: jest.fn().mockResolvedValue({}) },
      service: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      maintenanceRequest: { update: jest.fn() },
      lease: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      // Гард показаний: по умолчанию счётчиков нет → финализация проходит.
      meter: { findMany: jest.fn().mockResolvedValue([]) },
      meterReading: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    leases = { getForUser: jest.fn() };
    notifications = { notify: jest.fn().mockResolvedValue({}) };
    storage = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(Buffer.from('file')),
      delete: jest.fn().mockResolvedValue(undefined),
      getUrl: jest.fn().mockReturnValue('/uploads/x'),
    };
    service = new BillingService(
      prisma as unknown as PrismaService,
      leases as unknown as LeasesService,
      notifications as unknown as NotificationsService,
      storage as unknown as StorageProvider,
    );
  });

  describe('addManualLine', () => {
    it('landlord добавляет строку в черновик', async () => {
      prisma.bill.findUnique.mockResolvedValue(makeBill());
      await service.addManualLine(LANDLORD, 'b1', { title: 'Клининг', amount: 2000 });
      expect(prisma.billLineItem.create).toHaveBeenCalled();
    });

    it('не landlord → NotFound', async () => {
      prisma.bill.findUnique.mockResolvedValue(makeBill());
      await expect(
        service.addManualLine(TENANT, 'b1', { title: 'x', amount: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('нельзя добавлять в финал → Conflict', async () => {
      prisma.bill.findUnique.mockResolvedValue(
        makeBill({ stage: BillStage.final, paymentStatus: BillPaymentStatus.pending }),
      );
      await expect(
        service.addManualLine(LANDLORD, 'b1', { title: 'x', amount: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('finalize', () => {
    it('арендатор не может финализировать черновик договора', async () => {
      prisma.bill.findUnique.mockResolvedValue(makeBill());

      await expect(service.finalize(TENANT, 'b1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.bill.updateMany).not.toHaveBeenCalled();
      expect(prisma.bill.create).not.toHaveBeenCalled();
    });

    it('draft → final + создаёт черновик следующего периода', async () => {
      prisma.bill.findUnique.mockResolvedValue(makeBill());
      await service.finalize(LANDLORD, 'b1');
      expect(prisma.bill.updateMany).toHaveBeenCalledWith({
        where: { id: 'b1', stage: BillStage.draft },
        data: { stage: BillStage.final, paymentStatus: BillPaymentStatus.pending },
      });
      expect(prisma.bill.create).toHaveBeenCalled(); // следующий черновик
    });

    it('повторная финализация → Conflict', async () => {
      prisma.bill.findUnique.mockResolvedValue(
        makeBill({ stage: BillStage.final, paymentStatus: BillPaymentStatus.pending }),
      );
      await expect(service.finalize(LANDLORD, 'b1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('блокируется, если по счётчику нет показания за период', async () => {
      prisma.bill.findUnique.mockResolvedValue(makeBill());
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      await expect(service.finalize(LANDLORD, 'b1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.bill.updateMany).not.toHaveBeenCalledWith({
        where: { id: 'b1', stage: BillStage.draft },
        data: {
          stage: BillStage.final,
          paymentStatus: BillPaymentStatus.pending,
        },
      });
    });

    it('отключённый счётчик не блокирует счёт', async () => {
      prisma.bill.findUnique.mockResolvedValue(makeBill());
      // На объекте единственный счётчик, и он отключён (ADR-0014): показание
      // по нему подать уже нельзя, значит и требовать его нельзя — иначе счёт
      // не сформировать никогда. Мок ведёт себя как БД: фильтрует по isActive.
      prisma.meter.findMany.mockImplementation(
        ({ where }: { where: { isActive?: boolean } }) =>
          Promise.resolve(
            where.isActive ? [] : [{ id: 'm1', name: 'Электро' }],
          ),
      );
      await service.finalize(LANDLORD, 'b1');
      expect(prisma.bill.updateMany).toHaveBeenCalledWith({
        where: { id: 'b1', stage: BillStage.draft },
        data: { stage: BillStage.final, paymentStatus: BillPaymentStatus.pending },
      });
    });
  });

  describe('metersPendingForBill', () => {
    it('возвращает активный счётчик без строки расхода', async () => {
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);

      await expect(
        service.metersPendingForBill({ id: 'b1', propertyId: 'p1' }),
      ).resolves.toEqual([{ id: 'm1', name: 'Электро' }]);
    });

    it('не возвращает счётчик со строкой расхода этого счёта', async () => {
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      prisma.billLineItem.findMany.mockResolvedValue([{ sourceRefId: 'r1' }]);
      prisma.meterReading.findMany.mockResolvedValue([{ meterId: 'm1' }]);

      await expect(
        service.metersPendingForBill({ id: 'b1', propertyId: 'p1' }),
      ).resolves.toEqual([]);
    });

    it('чужой kind/source и null sourceRefId не могут закрыть обязанность', async () => {
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      prisma.billLineItem.findMany.mockResolvedValue([{ sourceRefId: null }]);

      await expect(
        service.metersPendingForBill({ id: 'b1', propertyId: 'p1' }),
      ).resolves.toEqual([{ id: 'm1', name: 'Электро' }]);

      expect(prisma.billLineItem.findMany).toHaveBeenCalledWith({
        where: {
          billId: 'b1',
          kind: BillItemKind.utility,
          source: BillItemSource.meter_reading,
          sourceRefId: { not: null },
        },
        select: { sourceRefId: true },
      });
    });

    it('одно показание закрывает только счёт со своей строкой, без каскада', async () => {
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      prisma.billLineItem.findMany.mockImplementation(
        ({ where }: { where: { billId: string } }) =>
          Promise.resolve(
            where.billId === 'bill-a' ? [{ sourceRefId: 'r1' }] : [],
          ),
      );
      prisma.meterReading.findMany.mockImplementation(
        ({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(where.id.in.includes('r1') ? [{ meterId: 'm1' }] : []),
      );

      await expect(
        service.metersPendingForBill({ id: 'bill-a', propertyId: 'p1' }),
      ).resolves.toEqual([]);
      await expect(
        service.metersPendingForBill({ id: 'bill-b', propertyId: 'p1' }),
      ).resolves.toEqual([{ id: 'm1', name: 'Электро' }]);
    });

    it('строка чужого счёта по тому же счётчику обязанность не закрывает', async () => {
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      prisma.billLineItem.findMany.mockResolvedValue([]);

      await expect(
        service.metersPendingForBill({ id: 'our-bill', propertyId: 'p1' }),
      ).resolves.toEqual([{ id: 'm1', name: 'Электро' }]);
      expect(prisma.billLineItem.findMany.mock.calls[0][0].where.billId).toBe(
        'our-bill',
      );
    });
  });

  describe('runPeriodTransition', () => {
    it('финализирует дозревший черновик и создаёт следующий', async () => {
      prisma.bill.findMany.mockResolvedValue([makeBill()]);
      const res = await service.runPeriodTransition(new Date());
      expect(res).toEqual({ finalized: 1, skipped: 0 });
      expect(prisma.bill.updateMany).toHaveBeenCalledWith({
        where: { id: 'b1', stage: BillStage.draft },
        data: { stage: BillStage.final, paymentStatus: BillPaymentStatus.pending },
      });
      expect(prisma.bill.create).toHaveBeenCalled();
    });

    it('пропускает черновик без показаний, не финализирует', async () => {
      prisma.bill.findMany.mockResolvedValue([makeBill()]);
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      const res = await service.runPeriodTransition(new Date());
      expect(res).toEqual({ finalized: 0, skipped: 1 });
      expect(prisma.bill.updateMany).not.toHaveBeenCalledWith({
        where: { id: 'b1', stage: BillStage.draft },
        data: {
          stage: BillStage.final,
          paymentStatus: BillPaymentStatus.pending,
        },
      });
      // Алерт обеим сторонам.
      expect(notifications.notify).toHaveBeenCalledWith(
        LANDLORD,
        expect.objectContaining({ type: 'readings_missing' }),
      );
      expect(notifications.notify).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ type: 'readings_missing' }),
      );
    });

    it('нет дозревших черновиков — ничего не делает', async () => {
      prisma.bill.findMany.mockResolvedValue([]);
      const res = await service.runPeriodTransition(new Date());
      expect(res).toEqual({ finalized: 0, skipped: 0 });
    });

    it('позднее показание со строкой в зависшем счёте позволяет финализацию', async () => {
      prisma.bill.findMany.mockResolvedValue([makeBill()]);
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      prisma.billLineItem.findMany.mockResolvedValue([{ sourceRefId: 'late-r1' }]);
      prisma.meterReading.findMany.mockResolvedValue([{ meterId: 'm1' }]);

      await expect(service.runPeriodTransition(new Date())).resolves.toEqual({
        finalized: 1,
        skipped: 0,
      });
      expect(prisma.bill.updateMany).toHaveBeenCalled();
    });

    it('пропускает черновик неактивного договора без алерта', async () => {
      prisma.bill.findMany.mockResolvedValue([
        makeBill({
          lease: { ...makeBill().lease, status: LeaseStatus.terminated },
        }),
      ]);

      await expect(service.runPeriodTransition(new Date())).resolves.toEqual({
        finalized: 0,
        skipped: 0,
      });
      expect(notifications.notify).not.toHaveBeenCalled();
      expect(prisma.bill.updateMany).not.toHaveBeenCalled();
    });

    it('ошибка БД при проверке обязанности пробрасывается без алерта и отметки', async () => {
      prisma.bill.findMany.mockResolvedValue([makeBill()]);
      prisma.meter.findMany.mockRejectedValue(new Error('database unavailable'));

      await expect(service.runPeriodTransition(new Date())).rejects.toThrow(
        'database unavailable',
      );
      expect(prisma.bill.updateMany).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('два прогона создают readings_missing только один раз', async () => {
      prisma.bill.findMany.mockResolvedValue([makeBill()]);
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      prisma.bill.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await service.runPeriodTransition(new Date());
      await service.runPeriodTransition(new Date());

      expect(notifications.notify).toHaveBeenCalledTimes(2);
      expect(prisma.bill.updateMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('runReadingReminders', () => {
    const now = new Date(Date.UTC(2026, 7, 21, 9));

    function draftDueIn(daysUntilPayment: number) {
      return {
        ...makeBill(),
        stage: BillStage.draft,
        periodStart: new Date(now.getTime() - 20 * 86400000),
        periodEnd: new Date(now.getTime() + daysUntilPayment * 86400000),
        dueDate: new Date(now.getTime() + daysUntilPayment * 86400000),
        lease: {
          ...makeBill().lease,
          status: LeaseStatus.active,
          tenantId: TENANT,
          property: { address: 'ул. Тестовая, 1' },
        },
      };
    }

    it('за 3 дня до срока показаний (8 дней до оплаты) → напоминание арендатору', async () => {
      prisma.bill.findMany.mockResolvedValue([draftDueIn(8)]);
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      const res = await service.runReadingReminders(now);
      expect(res.reminded).toBe(1);
      expect(notifications.notify).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ type: 'readings_reminder' }),
      );
    });

    it('за 5 дней до срока (10 дней до оплаты, не порог) → не напоминает', async () => {
      prisma.bill.findMany.mockResolvedValue([draftDueIn(10)]);
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      const res = await service.runReadingReminders(now);
      expect(res.reminded).toBe(0);
    });

    it('за 1 день до срока (6 дней до оплаты), но обязанность закрыта → не напоминает', async () => {
      prisma.bill.findMany.mockResolvedValue([draftDueIn(6)]);
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      prisma.billLineItem.findMany.mockResolvedValue([{ sourceRefId: 'r1' }]);
      prisma.meterReading.findMany.mockResolvedValue([{ meterId: 'm1' }]);
      const res = await service.runReadingReminders(now);
      expect(res.reminded).toBe(0);
    });

    it('после дедлайна уведомляет обе стороны разными текстами и ставит отметку', async () => {
      prisma.bill.findMany.mockResolvedValue([draftDueIn(2)]); // дедлайн был 3 дня назад
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);

      await expect(service.runReadingReminders(now)).resolves.toEqual({
        reminded: 0,
        overdueNotified: 1,
      });
      expect(prisma.bill.updateMany).toHaveBeenCalledWith({
        where: { id: 'b1', readingsOverdueAlertedAt: null },
        data: { readingsOverdueAlertedAt: now },
      });
      expect(notifications.notify).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({
          type: 'readings_overdue',
          title: 'Показания просрочены',
          body: expect.stringContaining('Подайте показания'),
        }),
      );
      expect(notifications.notify).toHaveBeenCalledWith(
        LANDLORD,
        expect.objectContaining({
          type: 'readings_overdue',
          title: 'Арендатор не подал показания',
          body: expect.stringContaining('нельзя сформировать'),
        }),
      );
    });

    it('повторный прогон не дублирует readings_overdue', async () => {
      prisma.bill.findMany.mockResolvedValue([draftDueIn(2)]);
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      prisma.bill.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.runReadingReminders(now)).resolves.toEqual({
        reminded: 0,
        overdueNotified: 0,
      });
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('пропущенный день не теряет просрочку: через 3 суток алерт уходит', async () => {
      prisma.bill.findMany.mockResolvedValue([draftDueIn(2)]);
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);

      const result = await service.runReadingReminders(now);

      expect(result.overdueNotified).toBe(1);
      expect(notifications.notify).toHaveBeenCalledTimes(2);
    });

    it('не шлёт просрочку при закрытой обязанности', async () => {
      prisma.bill.findMany.mockResolvedValue([draftDueIn(2)]);
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      prisma.billLineItem.findMany.mockResolvedValue([{ sourceRefId: 'r1' }]);
      prisma.meterReading.findMany.mockResolvedValue([{ meterId: 'm1' }]);

      await service.runReadingReminders(now);

      expect(prisma.bill.updateMany).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it.each([
      { status: LeaseStatus.terminated, tenantId: TENANT },
      { status: LeaseStatus.active, tenantId: null },
    ])('не шлёт просрочку для договора без живой обязанности', async (lease) => {
      prisma.bill.findMany.mockResolvedValue([
        {
          ...draftDueIn(2),
          lease: { ...draftDueIn(2).lease, ...lease },
        },
      ]);

      await service.runReadingReminders(now);

      expect(prisma.meter.findMany).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('applyTermination', () => {
    it('пропорционально уменьшает аренду и финализирует без next-draft', async () => {
      // Период 20.09–20.10 (30 дней), выезд 30.09 → 10 дней → аренда 50000*10/30.
      const draft = {
        ...makeBill(),
        periodStart: new Date(Date.UTC(2026, 8, 20, 12, 0, 0)),
        periodEnd: new Date(Date.UTC(2026, 9, 20, 12, 0, 0)),
        lineItems: [{ id: 'li-rent', kind: 'rent', amount: 50000 }],
      };
      prisma.bill.findFirst.mockResolvedValue(draft);
      prisma.billLineItem.update = jest.fn().mockResolvedValue({});
      prisma.billLineItem.findMany.mockResolvedValue([
        { kind: BillItemKind.rent, amount: 16666.67 },
      ]);

      await service.applyTermination(
        makeBill().lease as any,
        new Date(Date.UTC(2026, 8, 30, 12, 0, 0)),
      );

      const prorated = prisma.billLineItem.update.mock.calls[0][0].data.amount;
      expect(prorated).toBeCloseTo(16666.67, 1);
      // Финализация без следующего черновика.
      expect(prisma.bill.updateMany).toHaveBeenCalled();
      expect(prisma.bill.create).not.toHaveBeenCalled();
    });
  });

  describe('claimPaid', () => {
    const proof = { buffer: Buffer.from('чек'), mimetype: 'image/png' };

    it('tenant заявляет оплату по pending-счёту, чек уходит в хранилище', async () => {
      prisma.bill.findUnique.mockResolvedValue(
        makeBill({ stage: BillStage.final, paymentStatus: BillPaymentStatus.pending }),
      );
      await service.claimPaid(TENANT, 'b1', proof);
      expect(prisma.bill.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { paymentStatus: BillPaymentStatus.payment_claimed },
      });
      expect(storage.put).toHaveBeenCalledWith(
        expect.stringMatching(/^bills\/b1\/proof-.+\.png$/),
        proof.buffer,
        'image/png',
      );
      expect(prisma.paymentProof.upsert).toHaveBeenCalled();
      // Собственнику уходит уведомление «проверьте оплату».
      expect(notifications.notify).toHaveBeenCalledWith(
        LANDLORD,
        expect.objectContaining({ type: 'payment_claimed' }),
      );
    });

    it('чек недопустимого типа → BadRequest, статус не меняется', async () => {
      prisma.bill.findUnique.mockResolvedValue(
        makeBill({ stage: BillStage.final, paymentStatus: BillPaymentStatus.pending }),
      );
      await expect(
        service.claimPaid(TENANT, 'b1', {
          buffer: Buffer.from('x'),
          mimetype: 'text/plain',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bill.update).not.toHaveBeenCalled();
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('повторное заявление заменяет чек и удаляет старый файл', async () => {
      prisma.bill.findUnique.mockResolvedValue(
        makeBill({
          stage: BillStage.final,
          paymentStatus: BillPaymentStatus.payment_claimed,
          paymentProof: { storageKey: 'bills/b1/proof-old.png' },
        }),
      );
      await service.claimPaid(TENANT, 'b1', proof);
      expect(storage.delete).toHaveBeenCalledWith('bills/b1/proof-old.png');
      expect(notifications.notify).toHaveBeenCalledWith(
        LANDLORD,
        expect.objectContaining({ type: 'payment_claimed' }),
      );
    });

    it('по уже оплаченному счёту заявить нельзя → Conflict', async () => {
      prisma.bill.findUnique.mockResolvedValue(
        makeBill({ stage: BillStage.final, paymentStatus: BillPaymentStatus.paid }),
      );
      await expect(
        service.claimPaid(TENANT, 'b1', proof),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(storage.put).not.toHaveBeenCalled();
    });

    it.each([0, -100])(
      'по счёту с итогом %s заявить оплату нельзя и чек не сохраняется',
      async (amount) => {
        prisma.bill.findUnique.mockResolvedValue(
          makeBill({
            stage: BillStage.final,
            paymentStatus: BillPaymentStatus.pending,
            lineItems: [{ amount }],
          }),
        );

        await expect(service.claimPaid(TENANT, 'b1', proof)).rejects.toThrow(
          'По этому счёту нечего оплачивать',
        );
        expect(storage.put).not.toHaveBeenCalled();
      },
    );

    it('landlord не может заявлять оплату → Forbidden', async () => {
      prisma.bill.findUnique.mockResolvedValue(
        makeBill({ stage: BillStage.final, paymentStatus: BillPaymentStatus.pending }),
      );
      await expect(service.claimPaid(LANDLORD, 'b1', proof)).rejects.toThrow();
    });
  });

  describe('чек об оплате (ADR-0019)', () => {
    it('обе стороны видят чек, в том числе после оплаты', async () => {
      prisma.bill.findUnique.mockResolvedValue(
        makeBill({
          stage: BillStage.final,
          paymentStatus: BillPaymentStatus.paid,
          paymentProof: { storageKey: 'bills/b1/proof.png', mimeType: 'image/png' },
        }),
      );
      const asLandlord = await service.getPaymentProof(LANDLORD, 'b1');
      const asTenant = await service.getPaymentProof(TENANT, 'b1');
      expect(asLandlord.storageKey).toBe('bills/b1/proof.png');
      expect(asTenant.storageKey).toBe('bills/b1/proof.png');

      const file = await service.downloadPaymentProof(TENANT, 'b1');
      expect(storage.get).toHaveBeenCalledWith('bills/b1/proof.png');
      expect(file.mimeType).toBe('image/png');
    });

    it('посторонний не получает чек → NotFound', async () => {
      prisma.bill.findUnique.mockResolvedValue(
        makeBill({
          stage: BillStage.final,
          paymentProof: { storageKey: 'bills/b1/proof.png', mimeType: 'image/png' },
        }),
      );
      await expect(
        service.getPaymentProof('stranger', 'b1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('чека нет → NotFound', async () => {
      prisma.bill.findUnique.mockResolvedValue(
        makeBill({ stage: BillStage.final }),
      );
      await expect(
        service.getPaymentProof(TENANT, 'b1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('confirmPaid', () => {
    it('landlord подтверждает → paid + Payment с суммой включая пеню', async () => {
      // Просрочка 10 дней: 50000*0.001*10 = 500 → сумма 50500.
      const now = new Date(Date.UTC(2026, 9, 30, 12, 0, 0));
      jest.useFakeTimers().setSystemTime(now);
      prisma.bill.findUnique.mockResolvedValue(
        makeBill({ stage: BillStage.final, paymentStatus: BillPaymentStatus.payment_claimed }),
      );

      await service.confirmPaid(LANDLORD, 'b1');

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: { billId: 'b1', amount: 50500, confirmedById: LANDLORD },
      });
      expect(prisma.bill.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { paymentStatus: BillPaymentStatus.paid, paidAt: expect.any(Date) },
      });
      jest.useRealTimers();
    });

    it('уже оплаченный → Conflict', async () => {
      prisma.bill.findUnique.mockResolvedValue(
        makeBill({ stage: BillStage.final, paymentStatus: BillPaymentStatus.paid }),
      );
      await expect(service.confirmPaid(LANDLORD, 'b1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('waivePenalty', () => {
    it('замораживает накопленную пеню', async () => {
      const now = new Date(Date.UTC(2026, 9, 30, 12, 0, 0)); // +10 дней → 500
      jest.useFakeTimers().setSystemTime(now);
      prisma.bill.findUnique.mockResolvedValue(
        makeBill({ stage: BillStage.final, paymentStatus: BillPaymentStatus.pending }),
      );

      await service.waivePenalty(LANDLORD, 'b1');

      expect(prisma.bill.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: {
          penaltyWaived: true,
          penaltyWaivedAmount: 500,
          penaltyWaivedAt: expect.any(Date),
        },
      });
      jest.useRealTimers();
    });

    it('повторное прощение → Conflict', async () => {
      prisma.bill.findUnique.mockResolvedValue(
        makeBill({
          stage: BillStage.final,
          paymentStatus: BillPaymentStatus.pending,
          penaltyWaived: true,
        }),
      );
      await expect(service.waivePenalty(LANDLORD, 'b1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('разовые услуги (ADR-0025)', () => {
    function oneTimeService(overrides: Record<string, unknown> = {}) {
      return {
        id: 's1',
        propertyId: 'p1',
        name: 'Заявка: Ремонт',
        price: 100,
        serviceType: ServiceType.one_time,
        description: null,
        payer: SettlementPayer.tenant,
        sourceRequestId: 'req1',
        billedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    }

    it.each([
      [SettlementPayer.tenant, 100, 100],
      [SettlementPayer.split, 100, 50],
      [SettlementPayer.owner, 100, -100],
    ])('payer=%s выставляет сумму с нужным знаком', async (payer, price, expected) => {
      const item = oneTimeService({ payer, price });
      prisma.service.findUnique.mockResolvedValue(item);

      const result = await (service as any).billServiceIntoBill(
        prisma,
        'b1',
        item,
      );

      expect(result).toEqual({ billed: true, amount: expected });
      expect(prisma.billLineItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          billId: 'b1',
          kind: BillItemKind.service,
          source: BillItemSource.service,
          amount: expected,
          sourceRefId: 's1',
        }),
      });
    });

    it.each([
      [0.01, 0.01],
      [10.01, 5.01],
    ])('split от %s отдаёт арендатору %s', async (price, expected) => {
      const item = oneTimeService({ payer: SettlementPayer.split, price });
      prisma.service.findUnique.mockResolvedValue(item);

      await expect(
        (service as any).billServiceIntoBill(prisma, 'b1', item),
      ).resolves.toEqual({ billed: true, amount: expected });
    });

    it('повторный захват billedAt не создаёт вторую строку', async () => {
      const item = oneTimeService();
      prisma.service.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        (service as any).billServiceIntoBill(prisma, 'b1', item),
      ).resolves.toEqual({ billed: false, amount: 0 });
      expect(prisma.service.findUnique).not.toHaveBeenCalled();
      expect(prisma.billLineItem.create).not.toHaveBeenCalled();
    });

    it('нулевая сумма ставит billedAt без строки', async () => {
      const item = oneTimeService({ price: 0 });
      prisma.service.findUnique.mockResolvedValue(item);

      await expect(
        (service as any).billServiceIntoBill(prisma, 'b1', item),
      ).resolves.toEqual({ billed: true, amount: 0 });
      expect(prisma.service.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', billedAt: null },
        data: { billedAt: expect.any(Date) },
      });
      expect(prisma.billLineItem.create).not.toHaveBeenCalled();
    });

    it('после захвата перечитывает изменённую цену', async () => {
      const stale = oneTimeService({ price: 100 });
      prisma.service.findUnique.mockResolvedValue(
        oneTimeService({ price: 250 }),
      );

      await (service as any).billServiceIntoBill(prisma, 'b1', stale);

      expect(prisma.billLineItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ amount: 250 }),
      });
    });

    it('resolved сохраняет статус, строку и billedAt одной транзакцией', async () => {
      const request = {
        id: 'req1',
        category: 'Ремонт',
        status: 'in_progress',
      };
      const item = oneTimeService();
      prisma.maintenanceRequest.update.mockResolvedValue({
        ...request,
        status: 'resolved',
      });
      prisma.bill.findFirst.mockResolvedValue({ id: 'b1' });
      prisma.service.findUnique.mockResolvedValue(item);

      const result = await service.resolveRequestWithService(
        makeBill().lease as any,
        request as any,
        item as any,
      );

      expect(result.status).toBe('resolved');
      expect(prisma.maintenanceRequest.update).toHaveBeenCalled();
      expect(prisma.service.updateMany).toHaveBeenCalled();
      expect(prisma.billLineItem.create).toHaveBeenCalled();
    });

    it('сбой уведомления не откатывает выставление', async () => {
      const request = { id: 'req1', category: 'Ремонт' };
      const item = oneTimeService();
      prisma.maintenanceRequest.update.mockResolvedValue(request);
      prisma.bill.findFirst.mockResolvedValue({ id: 'b1' });
      prisma.service.findUnique.mockResolvedValue(item);
      notifications.notify.mockRejectedValue(new Error('channel down'));

      await expect(
        service.resolveRequestWithService(
          makeBill().lease as any,
          request as any,
          item as any,
        ),
      ).resolves.toEqual(request);
      expect(prisma.billLineItem.create).toHaveBeenCalled();
      expect(notifications.notify).toHaveBeenCalledTimes(2);
    });

    it('новый черновик выставляет ручные one_time и не берёт услуги заявок', async () => {
      const manual = oneTimeService({
        id: 'manual1',
        name: 'Разовый клининг',
        sourceRequestId: null,
      });
      prisma.service.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([manual]);
      prisma.service.findUnique.mockResolvedValue(manual);
      prisma.bill.create.mockResolvedValue({ id: 'b-new' });

      await (service as any).createDraftForPeriod(
        prisma,
        makeBill().lease,
        {
          periodStart: makeBill().periodStart,
          periodEnd: makeBill().periodEnd,
          dueDate: makeBill().dueDate,
        },
      );

      expect(prisma.service.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          propertyId: 'p1',
          serviceType: ServiceType.one_time,
          billedAt: null,
          sourceRequestId: null,
        },
      });
      expect(prisma.billLineItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          billId: 'b-new',
          sourceRefId: 'manual1',
        }),
      });
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('перенос отрицательного итога (ADR-0025)', () => {
    it('доводит текущий счёт до нуля и связывает перенос со следующим', async () => {
      prisma.billLineItem.findMany.mockResolvedValue([{ amount: -150 }]);
      prisma.bill.create.mockResolvedValue({ id: 'b-next' });

      await (service as any).finalizeBill(makeBill());

      expect(prisma.billLineItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          billId: 'b1',
          amount: 150,
          sourceRefId: 'b-next',
        }),
      });
      expect(prisma.billLineItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          billId: 'b-next',
          amount: -150,
          sourceRefId: 'b1',
        }),
      });
    });

    it('повторяет перенос через несколько отрицательных счетов', async () => {
      prisma.billLineItem.findMany
        .mockResolvedValueOnce([{ amount: -150 }])
        .mockResolvedValueOnce([{ amount: -40 }]);
      prisma.bill.create
        .mockResolvedValueOnce({ id: 'b-next' })
        .mockResolvedValueOnce({ id: 'b-third' });

      await (service as any).finalizeBill(makeBill());
      await (service as any).finalizeBill(
        makeBill({ id: 'b-next', periodStart: makeBill().periodEnd }),
      );

      expect(prisma.billLineItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          billId: 'b-third',
          amount: -40,
          sourceRefId: 'b-next',
        }),
      });
    });

    it.each([
      [null, 150],
      [500, 650],
    ])('при расторжении депозит %s увеличивается до %s', async (deposit, expected) => {
      prisma.billLineItem.findMany.mockResolvedValue([{ amount: -150 }]);
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        depositReturnAmount: deposit,
      });

      await (service as any).finalizeBill(makeBill(), { createNext: false });

      expect(prisma.lease.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { depositReturnAmount: expected },
      });
      expect(prisma.billLineItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          billId: 'b1',
          amount: 150,
          title: 'Перенос в возврат депозита',
        }),
      });
    });

    it('при расторжении считает перенос по перечитанной пропорциональной аренде', async () => {
      const draft = makeBill({
        lineItems: [
          { id: 'rent1', kind: BillItemKind.rent, amount: 1000, title: 'Аренда' },
          { id: 'deduction1', kind: BillItemKind.service, amount: -600 },
        ],
      });
      prisma.bill.findFirst.mockResolvedValue(draft);
      prisma.billLineItem.update = jest.fn().mockResolvedValue({});
      // После пропорции аренда стала 100, поэтому остаток вычета равен 500.
      prisma.billLineItem.findMany.mockResolvedValue([
        { amount: 100 },
        { amount: -600 },
      ]);
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        depositReturnAmount: 200,
      });

      await service.applyTermination(
        makeBill().lease as any,
        new Date(Date.UTC(2026, 8, 21, 12)),
      );

      expect(prisma.lease.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { depositReturnAmount: 700 },
      });
    });

    it('проигравший захват счёта не создаёт вторую пару переноса', async () => {
      prisma.bill.updateMany.mockResolvedValue({ count: 0 });

      await (service as any).finalizeBill(makeBill());

      expect(prisma.billLineItem.findMany).not.toHaveBeenCalled();
      expect(prisma.bill.create).not.toHaveBeenCalled();
      expect(prisma.billLineItem.create).not.toHaveBeenCalled();
    });

    it('первым действием транзакции блокирует строку договора', async () => {
      await (service as any).finalizeBill(makeBill());

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.bill.updateMany.mock.invocationCallOrder[0],
      );
    });

    it('сначала гасит непокрытый ущерб и не меняет снимок', async () => {
      prisma.billLineItem.findMany.mockResolvedValue([{ amount: -5000 }]);
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        depositReturnAmount: new Prisma.Decimal(1000),
        returnActUncoveredRemaining: new Prisma.Decimal(15_000),
        returnActDamageTotal: new Prisma.Decimal(25_000),
        returnActDepositReturn: new Prisma.Decimal(0),
        returnActUncovered: new Prisma.Decimal(15_000),
      });

      await (service as any).finalizeBill(makeBill(), { createNext: false });

      const data = prisma.lease.update.mock.calls[0][0].data;
      expect(data.depositReturnAmount).toBe(1000);
      expect(data.returnActUncoveredRemaining.toString()).toBe('10000');
      expect(data).not.toHaveProperty('returnActDamageTotal');
      expect(data).not.toHaveProperty('returnActDepositReturn');
      expect(data).not.toHaveProperty('returnActUncovered');
    });

    it('остаток переноса после ущерба увеличивает возврат депозита', async () => {
      prisma.billLineItem.findMany.mockResolvedValue([{ amount: -5000 }]);
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        depositReturnAmount: new Prisma.Decimal(1000),
        returnActUncoveredRemaining: new Prisma.Decimal(3000),
      });

      await (service as any).finalizeBill(makeBill(), { createNext: false });

      const data = prisma.lease.update.mock.calls[0][0].data;
      expect(data.depositReturnAmount).toBe(3000);
      expect(data.returnActUncoveredRemaining.toString()).toBe('0');
    });

    it('до подтверждения акта перенос целиком увеличивает возврат', async () => {
      prisma.billLineItem.findMany.mockResolvedValue([{ amount: -5000 }]);
      prisma.lease.findUnique.mockResolvedValue({
        id: 'l1',
        depositReturnAmount: new Prisma.Decimal(1000),
        returnActUncoveredRemaining: null,
      });

      await (service as any).finalizeBill(makeBill(), { createNext: false });

      expect(prisma.lease.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { depositReturnAmount: 6000 },
      });
    });
  });
});
