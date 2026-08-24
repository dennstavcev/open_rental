import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
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
  MaintenanceRequest,
  MaintenanceStatus,
  Payment,
  PaymentProof,
  Prisma,
  Service,
  ServiceType,
  SettlementPayer,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from '../leases/leases.service';
import {
  NotificationsService,
  NotifyInput,
} from '../notifications/notifications.service';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '../storage/storage-provider.interface';
import { AddLineItemDto } from './dto/add-line-item.dto';
import {
  billTotal,
  calendarDaysUntil,
  computeAccruedPenalty,
  computePeriod,
  computeReadingsDueDate,
  daysBetween,
  isOverdue,
  nextPeriod,
  Period,
  round2,
  tenantShareForPayer,
  toNumber,
} from './billing.util';

type BillWithItems = Bill & {
  lineItems: BillLineItem[];
  payment: Payment | null;
  paymentProof: PaymentProof | null;
};

type ServiceBillingResult = { billed: boolean; amount: number };

// Чек об оплате (ADR-0019): JPEG/PNG/PDF, как у сканов договора.
const ALLOWED_PROOF_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export interface ProofFile {
  buffer: Buffer;
  mimetype: string;
}

export interface BillView {
  bill: BillWithItems;
  total: number;
  accruedPenalty: number;
  totalDue: number;
  overdue: boolean;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: LeasesService,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
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
      include: { lineItems: true, payment: true, paymentProof: true },
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
      include: { lineItems: true, payment: true, paymentProof: true, lease: true },
    });
    let finalized = 0;
    let skipped = 0;
    for (const bill of dueDrafts) {
      if (bill.lease.status !== LeaseStatus.active) {
        continue;
      }
      const pending = await this.metersPendingForBill({
        id: bill.id,
        propertyId: bill.lease.propertyId,
      });
      if (pending.length) {
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
    const { count } = await this.prisma.bill.updateMany({
      where: { id: bill.id, readingsMissingAlertedAt: null },
      data: { readingsMissingAlertedAt: new Date() },
    });
    if (count !== 1) {
      return;
    }
    const recipients = [bill.lease.landlordId, bill.lease.tenantId].filter(
      (id): id is string => !!id,
    );
    for (const userId of recipients) {
      await this.notifyBestEffort(userId, {
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
      include: { lineItems: true, payment: true, paymentProof: true, lease: true },
      orderBy: { periodStart: 'asc' },
    });
    if (!draft) {
      return;
    }
    try {
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
          data: {
            amount: prorated,
            title: `${rentLine.title} (пропорционально)`,
          },
        });
      }
      await this.finalizeBill(draft, { createNext: false });
    } catch (error) {
      this.logger.error(
        `Не удалось применить биллинг расторжения: leaseId=${lease.id}, billId=${draft.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  // Финализация счёта + (опц.) создание черновика следующего периода. Общая
  // для ручной финализации, планировщика и расторжения.
  private async finalizeBill(
    bill: BillWithItems & { lease: Lease },
    opts: { createNext?: boolean } = {},
  ): Promise<void> {
    const createNext = opts.createNext ?? true;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM leases WHERE id = ${bill.lease.id} FOR UPDATE`;

      const claimed = await tx.bill.updateMany({
        where: { id: bill.id, stage: BillStage.draft },
        data: { stage: BillStage.final, paymentStatus: BillPaymentStatus.pending },
      });
      if (claimed.count !== 1) {
        return;
      }

      // При расторжении строка аренды уже могла стать пропорциональной.
      // Снимок bill загружен раньше, поэтому итог считаем только по БД.
      const lineItems = await tx.billLineItem.findMany({
        where: { billId: bill.id },
      });
      const total = billTotal(lineItems);

      let nextBill: Bill | null = null;
      if (createNext) {
        const next = nextPeriod(bill.periodEnd, bill.lease.paymentDay);
        nextBill = await this.createDraftForPeriod(tx, bill.lease, next);
      }

      if (total >= 0) {
        return;
      }

      const carry = round2(-total);
      if (nextBill) {
        await tx.billLineItem.create({
          data: {
            billId: bill.id,
            kind: BillItemKind.manual,
            source: BillItemSource.manual,
            amount: carry,
            title: 'Перенос вычета на следующий период',
            sourceRefId: nextBill.id,
          },
        });
        await tx.billLineItem.create({
          data: {
            billId: nextBill.id,
            kind: BillItemKind.manual,
            source: BillItemSource.manual,
            amount: -carry,
            title: 'Перенос вычета с прошлого периода',
            sourceRefId: bill.id,
          },
        });
        return;
      }

      await tx.billLineItem.create({
        data: {
          billId: bill.id,
          kind: BillItemKind.manual,
          source: BillItemSource.manual,
          amount: carry,
          title: 'Перенос в возврат депозита',
          sourceRefId: null,
        },
      });
      const currentLease = await tx.lease.findUnique({
        where: { id: bill.lease.id },
      });
      if (!currentLease) {
        throw new NotFoundException('Договор не найден');
      }
      const uncovered = currentLease.returnActUncoveredRemaining;
      let carryToDeposit = new Prisma.Decimal(carry);
      let uncoveredRemaining: Prisma.Decimal | null = null;
      if (uncovered != null && uncovered.greaterThan(0)) {
        const covered = uncovered.lessThan(carryToDeposit)
          ? uncovered
          : carryToDeposit;
        uncoveredRemaining = uncovered.minus(covered);
        carryToDeposit = carryToDeposit.minus(covered);
      }
      await tx.lease.update({
        where: { id: currentLease.id },
        data: {
          depositReturnAmount: round2(
            toNumber(currentLease.depositReturnAmount ?? 0) +
              carryToDeposit.toNumber(),
          ),
          ...(uncoveredRemaining !== null
            ? { returnActUncoveredRemaining: uncoveredRemaining }
            : {}),
        },
      });
    });
  }

  // Арендатор: «Я оплатил» → payment_claimed (заявление, не финализирует).
  // Чек обязателен (ADR-0019): смысл действия — «заявляю об оплате и вот
  // подтверждение», иначе собственнику нечего проверять. Повторный вызов до
  // подтверждения оплаты заменяет чек (неудачный скриншот) и уведомляет
  // собственника заново — для него это новое заявление.
  async claimPaid(
    userId: string,
    billId: string,
    file: ProofFile,
  ): Promise<BillView> {
    const ext = ALLOWED_PROOF_MIME[file.mimetype];
    if (!ext) {
      throw new BadRequestException(
        'Чек должен быть файлом JPEG, PNG или PDF',
      );
    }
    const bill = await this.getBillAsTenant(userId, billId);
    if (this.toView(bill, new Date()).totalDue <= 0) {
      throw new ConflictException('По этому счёту нечего оплачивать');
    }
    if (
      bill.stage !== BillStage.final ||
      (bill.paymentStatus !== BillPaymentStatus.pending &&
        bill.paymentStatus !== BillPaymentStatus.payment_claimed)
    ) {
      throw new ConflictException(
        'Заявить оплату можно только по неоплаченному счёту-финалу',
      );
    }

    const replacing = bill.paymentProof;
    const storageKey = `bills/${billId}/proof-${randomUUID()}.${ext}`;
    await this.storage.put(storageKey, file.buffer, file.mimetype);

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentProof.upsert({
        where: { billId },
        create: {
          billId,
          storageKey,
          mimeType: file.mimetype,
          uploadedById: userId,
        },
        update: {
          storageKey,
          mimeType: file.mimetype,
          uploadedById: userId,
          uploadedAt: new Date(),
        },
      });
      await tx.bill.update({
        where: { id: billId },
        data: { paymentStatus: BillPaymentStatus.payment_claimed },
      });
    });

    // Старый файл удаляем после успешной замены записи, а не до — иначе при
    // сбое транзакции остался бы битый ключ.
    if (replacing) {
      await this.storage.delete(replacing.storageKey);
    }

    // Собственнику — «проверьте, что оплата пришла» (ADR-0012).
    await this.notifications.notify(bill.lease.landlordId, {
      type: 'payment_claimed',
      title: 'Проверьте оплату',
      body: replacing
        ? 'Арендатор заменил чек по счёту — проверьте оплату ещё раз.'
        : 'Арендатор отметил счёт как оплаченный и приложил чек — подтвердите получение.',
    });
    return this.reload(billId);
  }

  // Чек видят обе стороны договора, в том числе после подтверждения оплаты:
  // он и нужен как след для спора задним числом (ADR-0019).
  async getPaymentProof(
    userId: string,
    billId: string,
  ): Promise<PaymentProof> {
    const bill = await this.getBillAsParty(userId, billId);
    if (!bill.paymentProof) {
      throw new NotFoundException('Чек по счёту не приложен');
    }
    return bill.paymentProof;
  }

  async downloadPaymentProof(
    userId: string,
    billId: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const proof = await this.getPaymentProof(userId, billId);
    return {
      buffer: await this.storage.get(proof.storageKey),
      mimeType: proof.mimeType,
    };
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
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    if (tx === this.prisma) {
      await this.ensureCurrentDraft(lease);
    }
    const draft = await tx.bill.findFirst({
      where: { leaseId: lease.id, stage: BillStage.draft },
      orderBy: { periodStart: 'asc' },
    });
    if (!draft) {
      throw new NotFoundException('Черновик счёта не найден');
    }
    await tx.billLineItem.create({
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

  // Публичный вход для разовой услуги: счёт гарантированно существует до
  // транзакции, а право на выставление захватывается уже внутри неё.
  async billOneTimeService(lease: Lease, serviceId: string): Promise<void> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: { sourceRequest: { select: { category: true } } },
    });
    if (!service) {
      throw new NotFoundException('Услуга не найдена');
    }
    if (service.serviceType !== ServiceType.one_time) {
      throw new ConflictException('Выставить отдельно можно только разовую услугу');
    }
    await this.ensureCurrentDraft(lease);
    const draft = await this.prisma.bill.findFirst({
      where: { leaseId: lease.id, stage: BillStage.draft },
      orderBy: { periodStart: 'asc' },
    });
    if (!draft) {
      throw new NotFoundException('Черновик счёта не найден');
    }
    const result = await this.prisma.$transaction((tx) =>
      this.billServiceIntoBill(tx, draft.id, service),
    );
    if (result.billed && result.amount !== 0) {
      await this.notifyServiceBilled(
        lease,
        service.sourceRequest?.category ?? service.name,
        service.payer,
        result.amount,
      );
    }
  }

  // Внутренний межмодульный вход: Maintenance передаёт обновление статуса
  // сюда, чтобы оно разделяло транзакцию с захватом услуги и строкой счёта.
  async resolveRequestWithService(
    lease: Lease,
    request: MaintenanceRequest,
    service: Service,
  ): Promise<MaintenanceRequest> {
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenanceRequest.update({
        where: { id: request.id },
        data: { status: MaintenanceStatus.resolved },
      });
      const draft = await tx.bill.findFirst({
        where: { leaseId: lease.id, stage: BillStage.draft },
        orderBy: { periodStart: 'asc' },
      });
      if (!draft) {
        throw new NotFoundException('Черновик счёта не найден');
      }
      const billed = await this.billServiceIntoBill(tx, draft.id, service);
      return { updated, billed };
    });
    if (result.billed.billed && result.billed.amount !== 0) {
      await this.notifyServiceBilled(
        lease,
        request.category,
        service.payer,
        result.billed.amount,
      );
    }
    return result.updated;
  }

  // ---- внутреннее ----

  async ensureCurrentDraft(lease: Lease): Promise<void> {
    const existingDraft = await this.prisma.bill.findFirst({
      where: { leaseId: lease.id, stage: BillStage.draft },
      orderBy: { periodStart: 'asc' },
    });
    if (existingDraft) {
      return;
    }
    const period = computePeriod(new Date(), lease.paymentDay);
    await this.prisma.$transaction((tx) =>
      this.createDraftForPeriod(tx, lease, period),
    );
  }

  private async createDraftForPeriod(
    tx: Prisma.TransactionClient,
    lease: Lease,
    period: Period,
  ): Promise<Bill> {
    const monthlyServices = await tx.service.findMany({
      where: { propertyId: lease.propertyId, serviceType: 'monthly' },
    });
    const oneTimeServices = await tx.service.findMany({
      where: {
        propertyId: lease.propertyId,
        serviceType: ServiceType.one_time,
        billedAt: null,
        sourceRequestId: null,
      },
    });
    const bill = await tx.bill.create({
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
    for (const service of oneTimeServices) {
      await this.billServiceIntoBill(tx, bill.id, service);
    }
    return bill;
  }

  // Сначала захватываем nullable-отметку, затем перечитываем цену внутри той
  // же транзакции: ручную услугу могли изменить после внешнего чтения.
  private async billServiceIntoBill(
    tx: Prisma.TransactionClient,
    billId: string,
    service: Pick<Service, 'id' | 'name' | 'price' | 'payer'>,
  ): Promise<ServiceBillingResult> {
    const claimed = await tx.service.updateMany({
      where: { id: service.id, billedAt: null },
      data: { billedAt: new Date() },
    });
    if (claimed.count !== 1) {
      return { billed: false, amount: 0 };
    }
    const current = await tx.service.findUnique({ where: { id: service.id } });
    if (!current) {
      throw new NotFoundException('Услуга не найдена');
    }

    const amount = tenantShareForPayer(current.price, current.payer);
    if (amount === 0) {
      return { billed: true, amount };
    }

    const payerNote =
      current.payer === SettlementPayer.owner
        ? ' (вычет за счёт собственника)'
        : current.payer === SettlementPayer.split
          ? ' (доля арендатора)'
          : '';
    await tx.billLineItem.create({
      data: {
        billId,
        kind: BillItemKind.service,
        source: BillItemSource.service,
        amount,
        title: `${current.name}${payerNote}`,
        sourceRefId: current.id,
      },
    });
    return { billed: true, amount };
  }

  private async notifyServiceBilled(
    lease: Lease,
    category: string,
    payer: SettlementPayer,
    amount: number,
  ): Promise<void> {
    const value = round2(Math.abs(amount));
    const isDeduction = payer === SettlementPayer.owner;
    if (lease.tenantId) {
      await this.notifyBestEffort(lease.tenantId, {
        type: isDeduction ? 'service_deduction_added' : 'service_added',
        title: isDeduction ? 'В счёт добавлен вычет' : 'В счёт добавлена услуга',
        body: `По заявке «${category}» ${isDeduction ? 'из текущего счёта вычтено' : 'в текущий счёт добавлено'} ${value} ₽.`,
      });
    }
    await this.notifyBestEffort(lease.landlordId, {
      type: 'request_service_billed',
      title: 'Услуга по заявке выставлена',
      body: `По заявке «${category}» в счёт ${isDeduction ? 'вычтено' : 'добавлено'} ${value} ₽.`,
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
      overdue: isOverdue(bill, total, now),
    };
  }

  // Гард: счёт не финализируется, если по объекту есть счётчик без строки
  // расхода в этом счёте (ADR-0024). Биллинг
  // читает таблицы счётчиков напрямую, чтобы не вводить цикл модулей
  // meters↔billing (показания зависят от billing, не наоборот).
  private async assertReadingsSubmitted(
    bill: BillWithItems & { lease: Lease },
  ): Promise<void> {
    const missing = (
      await this.metersPendingForBill({
        id: bill.id,
        propertyId: bill.lease.propertyId,
      })
    )[0];
    if (missing) {
      throw new ConflictException(
        `Не поданы показания счётчика «${missing.name}» за период`,
      );
    }
  }

  // Какие активные счётчики объекта ещё не закрыты строкой расхода в этом
  // счёте (ADR-0024, §3.0).
  async metersPendingForBill(bill: {
    id: string;
    propertyId: string;
  }): Promise<{ id: string; name: string }[]> {
    // Только активные счётчики: отключённый (ADR-0014) не принимает новые
    // показания в MeterReadingsService.create — если бы он попадал сюда,
    // счёт по объекту нельзя было бы финализировать никогда.
    const meters = await this.prisma.meter.findMany({
      where: { propertyId: bill.propertyId, isActive: true },
      select: { id: true, name: true },
    });
    const lineItems = await this.prisma.billLineItem.findMany({
      where: {
        billId: bill.id,
        kind: BillItemKind.utility,
        source: BillItemSource.meter_reading,
        sourceRefId: { not: null },
      },
      select: { sourceRefId: true },
    });
    const readings = await this.prisma.meterReading.findMany({
      where: {
        id: {
          in: lineItems
            .map((item) => item.sourceRefId)
            .filter((id): id is string => id !== null),
        },
      },
      select: { meterId: true },
    });
    const submittedMeterIds = new Set(readings.map((reading) => reading.meterId));
    return meters.filter((meter) => !submittedMeterIds.has(meter.id));
  }

  // Каскад напоминаний: за 3 и за 1 день до срока — арендатору напомнить
  // подать показания, если они ещё не поданы (docs/MVP_SCOPE.md,
  // «Напоминания по периоду»). Ежедневный скан (ADR-0013).
  async runReadingReminders(
    now: Date = new Date(),
  ): Promise<{ reminded: number; overdueNotified: number }> {
    const drafts = await this.prisma.bill.findMany({
      where: { stage: BillStage.draft },
      include: {
        lease: {
          include: { property: { select: { address: true } } },
        },
      },
    });
    let reminded = 0;
    let overdueNotified = 0;
    for (const bill of drafts) {
      if (
        bill.lease.status !== LeaseStatus.active ||
        !bill.lease.tenantId
      ) {
        continue;
      }
      const pending = await this.metersPendingForBill({
        id: bill.id,
        propertyId: bill.lease.propertyId,
      });
      if (!pending.length) {
        continue;
      }
      const daysUntil = calendarDaysUntil(
        computeReadingsDueDate(bill.periodEnd),
        now,
      );
      if (daysUntil === 3 || daysUntil === 1) {
        await this.notifyBestEffort(bill.lease.tenantId, {
          type: 'readings_reminder',
          title: 'Подайте показания счётчиков',
          body: `До срока подачи показаний ${daysUntil} дн. — подайте показания счётчиков.`,
        });
        reminded += 1;
        continue;
      }
      if (daysUntil >= 0) {
        continue;
      }
      const { count } = await this.prisma.bill.updateMany({
        where: { id: bill.id, readingsOverdueAlertedAt: null },
        data: { readingsOverdueAlertedAt: now },
      });
      if (count !== 1) {
        continue;
      }
      overdueNotified += 1;
      await this.notifyBestEffort(bill.lease.tenantId, {
        type: 'readings_overdue',
        title: 'Показания просрочены',
        body: `Срок подачи показаний по объекту «${bill.lease.property.address}» истёк. Подайте показания — без них счёт за период не сформируется.`,
      });
      await this.notifyBestEffort(bill.lease.landlordId, {
        type: 'readings_overdue',
        title: 'Арендатор не подал показания',
        body: `По объекту «${bill.lease.property.address}» истёк срок подачи показаний. Счёт за период нельзя сформировать, пока показаний нет.`,
      });
    }
    return { reminded, overdueNotified };
  }

  private async notifyBestEffort(
    userId: string,
    input: NotifyInput,
  ): Promise<void> {
    try {
      await this.notifications.notify(userId, input);
    } catch (error) {
      this.logger.warn(
        `Не удалось создать уведомление «${input.type}» для ${userId}: ${String(error)}`,
      );
    }
  }

  private async reload(billId: string): Promise<BillView> {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: { lineItems: true, payment: true, paymentProof: true },
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
      include: { lineItems: true, payment: true, paymentProof: true, lease: true },
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
