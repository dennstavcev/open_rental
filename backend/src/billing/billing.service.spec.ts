import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BillPaymentStatus, BillStage } from '@prisma/client';
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
        create: jest.fn().mockResolvedValue({}),
      },
      billLineItem: { create: jest.fn().mockResolvedValue({}) },
      payment: { create: jest.fn().mockResolvedValue({}) },
      paymentProof: { upsert: jest.fn().mockResolvedValue({}) },
      service: { findMany: jest.fn().mockResolvedValue([]) },
      // Гард показаний: по умолчанию счётчиков нет → финализация проходит.
      meter: { findMany: jest.fn().mockResolvedValue([]) },
      meterReading: { findFirst: jest.fn().mockResolvedValue(null) },
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
    it('draft → final + создаёт черновик следующего периода', async () => {
      prisma.bill.findUnique.mockResolvedValue(makeBill());
      await service.finalize(LANDLORD, 'b1');
      expect(prisma.bill.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
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
      prisma.meterReading.findFirst.mockResolvedValue(null); // показания нет
      await expect(service.finalize(LANDLORD, 'b1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.bill.update).not.toHaveBeenCalled();
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
      prisma.meterReading.findFirst.mockResolvedValue(null);

      await service.finalize(LANDLORD, 'b1');
      expect(prisma.bill.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { stage: BillStage.final, paymentStatus: BillPaymentStatus.pending },
      });
    });
  });

  describe('runPeriodTransition', () => {
    it('финализирует дозревший черновик и создаёт следующий', async () => {
      prisma.bill.findMany.mockResolvedValue([makeBill()]);
      const res = await service.runPeriodTransition(new Date());
      expect(res).toEqual({ finalized: 1, skipped: 0 });
      expect(prisma.bill.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { stage: BillStage.final, paymentStatus: BillPaymentStatus.pending },
      });
      expect(prisma.bill.create).toHaveBeenCalled();
    });

    it('пропускает черновик без показаний, не финализирует', async () => {
      prisma.bill.findMany.mockResolvedValue([makeBill()]);
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      prisma.meterReading.findFirst.mockResolvedValue(null);
      const res = await service.runPeriodTransition(new Date());
      expect(res).toEqual({ finalized: 0, skipped: 1 });
      expect(prisma.bill.update).not.toHaveBeenCalled();
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
  });

  describe('runReadingReminders', () => {
    function draftDueIn(days: number) {
      const now = Date.now();
      return {
        ...makeBill(),
        stage: BillStage.draft,
        periodStart: new Date(now - 20 * 86400000),
        periodEnd: new Date(now + days * 86400000),
        dueDate: new Date(now + days * 86400000),
        lease: { ...makeBill().lease, status: 'active', tenantId: TENANT },
      };
    }

    it('за 3 дня до оплаты и нет показаний → напоминание арендатору', async () => {
      prisma.bill.findMany.mockResolvedValue([draftDueIn(3)]);
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      prisma.meterReading.findFirst.mockResolvedValue(null);
      const res = await service.runReadingReminders(new Date());
      expect(res.reminded).toBe(1);
      expect(notifications.notify).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ type: 'readings_reminder' }),
      );
    });

    it('за 5 дней (не порог) → не напоминает', async () => {
      prisma.bill.findMany.mockResolvedValue([draftDueIn(5)]);
      const res = await service.runReadingReminders(new Date());
      expect(res.reminded).toBe(0);
    });

    it('показания уже поданы → не напоминает', async () => {
      prisma.bill.findMany.mockResolvedValue([draftDueIn(1)]);
      prisma.meter.findMany.mockResolvedValue([{ id: 'm1', name: 'Электро' }]);
      prisma.meterReading.findFirst.mockResolvedValue({ id: 'r1' });
      const res = await service.runReadingReminders(new Date());
      expect(res.reminded).toBe(0);
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
      prisma.billLineItem = { update: jest.fn().mockResolvedValue({}) };

      await service.applyTermination(
        makeBill().lease as any,
        new Date(Date.UTC(2026, 8, 30, 12, 0, 0)),
      );

      const prorated = prisma.billLineItem.update.mock.calls[0][0].data.amount;
      expect(prorated).toBeCloseTo(16666.67, 1);
      // Финализация без следующего черновика.
      expect(prisma.bill.update).toHaveBeenCalled();
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
});
