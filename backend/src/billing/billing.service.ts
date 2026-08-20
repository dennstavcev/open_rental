import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Bill,
  BillItemKind,
  BillItemSource,
  BillLineItem,
  BillPaymentStatus,
  BillStage,
  Lease,
  LeaseStatus,
  Payment,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from '../leases/leases.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AddLineItemDto } from './dto/add-line-item.dto';
import {
  billTotal,
  computeAccruedPenalty,
  computePeriod,
  daysBetween,
  isOverdue,
  nextPeriod,
  Period,
  round2,
  toNumber,
} from './billing.util';

type BillWithItems = Bill & { lineItems: BillLineItem[]; payment: Payment | null };

export interface BillView {
  bill: BillWithItems;
  total: number;
  accruedPenalty: number;
  totalDue: number;
  overdue: boolean;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: LeasesService,
    private readonly notifications: NotificationsService,
  ) {}

  // Счета договора с вычисленными пенями/просрочкой/суммами. Для активного
  // договора лениво создаётся текущий черновик, если его ещё нет.
  async listBills(userId: string, leaseId: string): Promise<BillView[]> {
    const lease = await this.leases.getForUser(userId, leaseId);
    if (lease.status === LeaseStatus.active) {
      await this.ensureCurrentDraft(lease);
    }
    const bills = await this.prisma.bill.findMany({
      where: { leaseId },
      include: { lineItems: true, payment: true },
      orderBy: { periodStart: 'desc' },
    });
    const now = new Date();
    return bills.map((bill) => this.toView(bill, now));
  }

  async addManualLine(
    userId: string,
    billId: string,
    dto: AddLineItemDto,
  ): Promise<BillView> {
    const bill = await this.getBillAsLandlord(userId, billId);
    if (bill.stage !== BillStage.draft) {
      throw new ConflictException(
        'Статьи добавляются только в черновик счёта',
      );
    }
    await this.prisma.billLineItem.create({
      data: {
        billId,
        kind: BillItemKind.manual,
        source: BillItemSource.manual,
        amount: dto.amount,
        title: dto.title,
      },
    });
    return this.reload(billId);
  }

  // Финализация draft → final (кнопка доступна обеим сторонам) + создание
  // черновика следующего периода. Ручная — планировщик отложён.
  async finalize(userId: string, billId: string): Promise<BillView> {
    const bill = await this.getBillAsParty(userId, billId);
    if (bill.stage !== BillStage.draft) {
      throw new ConflictException('Счёт уже финализирован');
    }
    await this.assertReadingsSubmitted(bill);
    await this.finalizeBill(bill);
    return this.reload(billId);
  }

  // Идемпотентный переход периодов (планировщик, ADR-0013): финализирует
  // «дозревшие» черновики (граница периода наступила) и создаёт следующий.
  // Черновики с непо́данными показаниями пропускаются — дозреют позже.
  async runPeriodTransition(
    now: Date = new Date(),
  ): Promise<{ finalized: number; skipped: number }> {
    const dueDrafts = await this.prisma.bill.findMany({
      where: { stage: BillStage.draft, periodEnd: { lte: now } },
      include: { lineItems: true, payment: true, lease: true },
    });
    let finalized = 0;
    let skipped = 0;
    for (const bill of dueDrafts) {
      try {
        await this.assertReadingsSubmitted(bill);
      } catch {
        // Показания не поданы — не финализируем, алерт обеим сторонам
        // («расчёт не готов», а не тихое закрытие — MVP_SCOPE).
        await this.alertReadingsMissing(bill);
        skipped += 1;
        continue;
      }
      await this.finalizeBill(bill);
      finalized += 1;
    }
    return { finalized, skipped };
  }

  // Алерт обеим сторонам, что расчёт не готов из-за непо́данных показаний.
  private async alertReadingsMissing(
    bill: BillWithItems & { lease: Lease },
  ): Promise<void> {
    const recipients = [bill.lease.landlordId, bill.lease.tenantId].filter(
      (id): id is string => !!id,
    );
    for (const userId of recipients) {
      await this.notifications.notify(userId, {
        type: 'readings_missing',
        title: 'Расчёт за период не готов',
        body: 'Не поданы показания счётчиков — счёт не может быть сформирован.',
      });
    }
  }

  // Расторжение: пропорция аренды в текущем черновике (по прожитым дням) +
  // финализация последнего счёта без создания следующего периода.
  async applyTermination(lease: Lease, effectiveEndDate: Date): Promise<void> {
    await this.ensureCurrentDraft(lease);
    const draft = await this.prisma.bill.findFirst({
      where: { leaseId: lease.id, stage: BillStage.draft },
      include: { lineItems: true, payment: true, lease: true },
    });
    if (!draft) {
      return;
    }
    const rentLine = draft.lineItems.find(
      (li) => li.kind === BillItemKind.rent,
    );
    if (rentLine) {
      const totalDays = daysBetween(draft.periodStart, draft.periodEnd);
      const usedDays = Math.min(
        totalDays,
        Math.max(1, daysBetween(draft.periodStart, effectiveEndDate)),
      );
      const prorated = round2(
        (toNumber(rentLine.amount) * usedDays) / totalDays,
      );
      await this.prisma.billLineItem.update({
        where: { id: rentLine.id },
        data: { amount: prorated, title: `${rentLine.title} (пропорционально)` },
      });
    }
    await this.finalizeBill(draft, { createNext: false });
  }

  // Финализация счёта + (опц.) создание черновика следующего периода. Общая
  // для ручной финализации, планировщика и расторжения.
  private async finalizeBill(
    bill: BillWithItems & { lease: Lease },
    opts: { createNext?: boolean } = {},
  ): Promise<void> {
    const createNext = opts.createNext ?? true;
    await this.prisma.$transaction(async (tx) => {
      await tx.bill.update({
        where: { id: bill.id },
        data: { stage: BillStage.final, paymentStatus: BillPaymentStatus.pending },
      });
      if (createNext) {
        const next = nextPeriod(bill.periodEnd, bill.lease.paymentDay);
        await this.createDraftForPeriod(tx, bill.lease, next);
      }
    });
  }

  // Арендатор: «Я оплатил» → payment_claimed (заявление, не финализирует).
  async claimPaid(userId: string, billId: string): Promise<BillView> {
    const bill = await this.getBillAsTenant(userId, billId);
    if (
      bill.stage !== BillStage.final ||
      bill.paymentStatus !== BillPaymentStatus.pending
    ) {
      throw new ConflictException(
        'Заявить оплату можно только по счёту в статусе «ожидается»',
      );
    }
    await this.prisma.bill.update({
      where: { id: billId },
      data: { paymentStatus: BillPaymentStatus.payment_claimed },
    });
    // Собственнику — «проверьте, что оплата пришла» (ADR-0012).
    await this.notifications.notify(bill.lease.landlordId, {
      type: 'payment_claimed',
      title: 'Проверьте оплату',
      body: 'Арендатор отметил счёт как оплаченный — подтвердите получение.',
    });
    return this.reload(billId);
  }

  // Собственник: «Оплата получена» → paid (только это финализирует оплату,
  // ADR-0012), фиксируется Payment, пеня останавливается.
  async confirmPaid(userId: string, billId: string): Promise<BillView> {
    const bill = await this.getBillAsLandlord(userId, billId);
    if (
      bill.stage !== BillStage.final ||
      bill.paymentStatus === BillPaymentStatus.paid
    ) {
      throw new ConflictException('Счёт не в статусе ожидания оплаты');
    }
    const view = this.toView(bill, new Date());
    await this.prisma.$transaction(async (tx) => {
      await tx.bill.update({
        where: { id: billId },
        data: { paymentStatus: BillPaymentStatus.paid, paidAt: new Date() },
      });
      await tx.payment.create({
        data: { billId, amount: view.totalDue, confirmedById: userId },
      });
    });
    return this.reload(billId);
  }

  // Прощение пени (собственник, одностороннее, необратимо): фиксирует
  // накопленную сумму и останавливает дальнейшее накопление.
  async waivePenalty(userId: string, billId: string): Promise<BillView> {
    const bill = await this.getBillAsLandlord(userId, billId);
    if (bill.stage !== BillStage.final) {
      throw new ConflictException('Прощение доступно только по счёту-финалу');
    }
    if (bill.paymentStatus === BillPaymentStatus.paid) {
      throw new ConflictException('Счёт уже оплачен');
    }
    if (bill.penaltyWaived) {
      throw new ConflictException('Пеня уже прощена');
    }
    const view = this.toView(bill, new Date());
    await this.prisma.bill.update({
      where: { id: billId },
      data: {
        penaltyWaived: true,
        penaltyWaivedAmount: view.accruedPenalty,
        penaltyWaivedAt: new Date(),
      },
    });
    return this.reload(billId);
  }

  // Добавляет коммунальную строку (из показаний счётчика) в текущий
  // черновик счёта договора. Вызывается модулем показаний.
  async addUtilityLine(
    lease: Lease,
    data: { title: string; amount: number; sourceRefId: string },
  ): Promise<void> {
    await this.ensureCurrentDraft(lease);
    const draft = await this.prisma.bill.findFirst({
      where: { leaseId: lease.id, stage: BillStage.draft },
    });
    if (!draft) {
      throw new NotFoundException('Черновик счёта не найден');
    }
    await this.prisma.billLineItem.create({
      data: {
        billId: draft.id,
        kind: BillItemKind.utility,
        source: BillItemSource.meter_reading,
        amount: data.amount,
        title: data.title,
        sourceRefId: data.sourceRefId,
      },
    });
  }

  // Добавляет строку урегулирования по заявке в текущий черновик счёта.
  // Вызывается модулем Maintenance по двустороннему подтверждению суммы.
  async addSettlementLine(
    lease: Lease,
    data: { title: string; amount: number; sourceRefId: string },
  ): Promise<void> {
    await this.ensureCurrentDraft(lease);
    const draft = await this.prisma.bill.findFirst({
      where: { leaseId: lease.id, stage: BillStage.draft },
    });
    if (!draft) {
      throw new NotFoundException('Черновик счёта не найден');
    }
    await this.prisma.billLineItem.create({
      data: {
        billId: draft.id,
        kind: BillItemKind.maintenance,
        source: BillItemSource.maintenance,
        amount: data.amount,
        title: data.title,
        sourceRefId: data.sourceRefId,
      },
    });
  }

  // ---- внутреннее ----

  async ensureCurrentDraft(lease: Lease): Promise<void> {
    const existingDraft = await this.prisma.bill.findFirst({
      where: { leaseId: lease.id, stage: BillStage.draft },
    });
    if (existingDraft) {
      return;
    }
    const period = computePeriod(new Date(), lease.paymentDay);
    await this.createDraftForPeriod(this.prisma, lease, period);
  }

  private async createDraftForPeriod(
    tx: Prisma.TransactionClient | PrismaService,
    lease: Lease,
    period: Period,
  ): Promise<void> {
    const monthlyServices = await tx.service.findMany({
      where: { propertyId: lease.propertyId, serviceType: 'monthly' },
    });
    await tx.bill.create({
      data: {
        leaseId: lease.id,
        stage: BillStage.draft,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        dueDate: period.dueDate,
        penaltyRatePercentPerDay: lease.penaltyRatePercentPerDay,
        lineItems: {
          create: [
            {
              // Базовая строка аренды (kind=rent — основной признак;
              // source=manual означает системную/базовую строку).
              kind: BillItemKind.rent,
              source: BillItemSource.manual,
              amount: lease.rentAmount,
              title: 'Аренда',
            },
            ...monthlyServices.map((s) => ({
              kind: BillItemKind.service,
              source: BillItemSource.service,
              amount: s.price,
              title: s.name,
              sourceRefId: s.id,
            })),
          ],
        },
      },
    });
  }

  private toView(bill: BillWithItems, now: Date): BillView {
    const total = billTotal(bill.lineItems);
    const accruedPenalty = computeAccruedPenalty({
      total,
      penaltyRatePercentPerDay: bill.penaltyRatePercentPerDay,
      dueDate: bill.dueDate,
      now,
      stage: bill.stage,
      paymentStatus: bill.paymentStatus,
      penaltyWaived: bill.penaltyWaived,
      penaltyWaivedAmount: bill.penaltyWaivedAmount,
    });
    // Прощённая пеня не входит в сумму к оплате.
    const penaltyDue = bill.penaltyWaived ? 0 : accruedPenalty;
    return {
      bill,
      total,
      accruedPenalty,
      totalDue: round2(total + penaltyDue),
      overdue: isOverdue(bill, now),
    };
  }

  // Гард: счёт не финализируется, если по объекту есть счётчик без показания
  // в текущем периоде (docs/MVP_SCOPE.md, «Важное исключение»). Биллинг
  // читает таблицы счётчиков напрямую, чтобы не вводить цикл модулей
  // meters↔billing (показания зависят от billing, не наоборот).
  private async assertReadingsSubmitted(
    bill: BillWithItems & { lease: Lease },
  ): Promise<void> {
    const missing = await this.firstMeterWithoutReading(
      bill.lease.propertyId,
      bill.periodStart,
      bill.periodEnd,
    );
    if (missing) {
      throw new ConflictException(
        `Не поданы показания счётчика «${missing.name}» за период`,
      );
    }
  }

  private async firstMeterWithoutReading(
    propertyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ id: string; name: string } | null> {
    // Только активные счётчики: отключённый (ADR-0014) не принимает новые
    // показания в MeterReadingsService.create — если бы он попадал сюда,
    // счёт по объекту нельзя было бы финализировать никогда.
    const meters = await this.prisma.meter.findMany({
      where: { propertyId, isActive: true },
      select: { id: true, name: true },
    });
    for (const meter of meters) {
      const reading = await this.prisma.meterReading.findFirst({
        where: {
          meterId: meter.id,
          readingDate: { gte: periodStart, lt: periodEnd },
        },
      });
      if (!reading) {
        return meter;
      }
    }
    return null;
  }

  // Каскад напоминаний: за 3 и за 1 день до оплаты — арендатору напомнить
  // подать показания, если они ещё не поданы (docs/MVP_SCOPE.md,
  // «Напоминания по периоду»). Ежедневный скан (ADR-0013).
  async runReadingReminders(
    now: Date = new Date(),
  ): Promise<{ reminded: number }> {
    const drafts = await this.prisma.bill.findMany({
      where: { stage: BillStage.draft },
      include: { lease: true },
    });
    let reminded = 0;
    for (const bill of drafts) {
      if (
        bill.lease.status !== LeaseStatus.active ||
        !bill.lease.tenantId
      ) {
        continue;
      }
      const daysUntilDue = Math.ceil(
        (bill.dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (daysUntilDue !== 3 && daysUntilDue !== 1) {
        continue;
      }
      const missing = await this.firstMeterWithoutReading(
        bill.lease.propertyId,
        bill.periodStart,
        bill.periodEnd,
      );
      if (!missing) {
        continue;
      }
      await this.notifications.notify(bill.lease.tenantId, {
        type: 'readings_reminder',
        title: 'Подайте показания счётчиков',
        body: `До даты оплаты ${daysUntilDue} дн. — подайте показания счётчиков.`,
      });
      reminded += 1;
    }
    return { reminded };
  }

  private async reload(billId: string): Promise<BillView> {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: { lineItems: true, payment: true },
    });
    if (!bill) {
      throw new NotFoundException('Счёт не найден');
    }
    return this.toView(bill, new Date());
  }

  private async loadBillWithLease(
    billId: string,
  ): Promise<BillWithItems & { lease: Lease }> {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: { lineItems: true, payment: true, lease: true },
    });
    if (!bill) {
      throw new NotFoundException('Счёт не найден');
    }
    return bill;
  }

  private async getBillAsParty(
    userId: string,
    billId: string,
  ): Promise<BillWithItems & { lease: Lease }> {
    const bill = await this.loadBillWithLease(billId);
    if (bill.lease.landlordId !== userId && bill.lease.tenantId !== userId) {
      throw new NotFoundException('Счёт не найден');
    }
    return bill;
  }

  private async getBillAsLandlord(
    userId: string,
    billId: string,
  ): Promise<BillWithItems & { lease: Lease }> {
    const bill = await this.loadBillWithLease(billId);
    if (bill.lease.landlordId !== userId) {
      throw new NotFoundException('Счёт не найден');
    }
    return bill;
  }

  private async getBillAsTenant(
    userId: string,
    billId: string,
  ): Promise<BillWithItems & { lease: Lease }> {
    const bill = await this.loadBillWithLease(billId);
    if (bill.lease.tenantId !== userId) {
      throw new ForbiddenException('Действие доступно только арендатору');
    }
    return bill;
  }
}
