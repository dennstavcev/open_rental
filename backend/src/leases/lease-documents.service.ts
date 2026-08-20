import { Injectable, NotFoundException } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { LeaseDocument, LeaseDocumentKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from './leases.service';
import { toNumber } from '../billing/billing.util';
import { LEASE_CONTRACT_TEMPLATE } from './templates/lease-contract.template';
import { LEASE_HANDOVER_ACT_TEMPLATE } from './templates/lease-handover-act.template';

const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

@Injectable()
export class LeaseDocumentsService {
  private readonly contractTemplate = Handlebars.compile(
    LEASE_CONTRACT_TEMPLATE,
  );
  private readonly handoverActTemplate = Handlebars.compile(
    LEASE_HANDOVER_ACT_TEMPLATE,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: LeasesService,
  ) {}

  // Генерация новой версии текста договора (только landlord).
  //
  // Сознательно не подставляет ФИО/паспорт/адрес сторон (ADR-0017, чтобы не
  // попадать в периметр 152-ФЗ) — эти поля в шаблоне остаются прочерками для
  // заполнения от руки, поэтому lease.landlord/lease.tenant здесь не нужны
  // за пределами проверки владельца.
  async generate(userId: string, leaseId: string): Promise<LeaseDocument> {
    const lease = await this.prisma.lease.findUnique({
      where: { id: leaseId },
      include: { property: true },
    });
    if (!lease || lease.landlordId !== userId) {
      throw new NotFoundException('Договор не найден');
    }

    const content = this.contractTemplate({
      propertyAddress: lease.property.address,
      propertyArea:
        lease.property.areaSqm != null
          ? `${toNumber(lease.property.areaSqm)} кв.м`
          : '__________',
      startDate: this.formatRuDate(lease.startDate),
      termMonths: this.monthsBetween(lease.startDate, lease.endDate),
      rentAmount: toNumber(lease.rentAmount),
      paymentDay: lease.paymentDay,
      depositAmount: toNumber(lease.depositAmount),
      city: 'Москва',
      generatedDate: this.formatRuDate(new Date()),
    });

    return this.saveNextVersion(
      leaseId,
      LeaseDocumentKind.contract,
      content,
      userId,
    );
  }

  async getLatest(userId: string, leaseId: string): Promise<LeaseDocument> {
    return this.getLatestOfKind(
      userId,
      leaseId,
      LeaseDocumentKind.contract,
      'Текст договора ещё не сгенерирован',
    );
  }

  // Генерация новой версии Приложения №1 — акта приёма-передачи имущества
  // (ADR-0018). Опись берётся из LeaseInventoryItem на момент генерации;
  // как и в generate(), персональные данные сторон не подставляются
  // (ADR-0017) — только описание вещей.
  async generateHandoverAct(
    userId: string,
    leaseId: string,
  ): Promise<LeaseDocument> {
    const lease = await this.prisma.lease.findUnique({
      where: { id: leaseId },
      include: { property: true },
    });
    if (!lease || lease.landlordId !== userId) {
      throw new NotFoundException('Договор не найден');
    }

    const items = await this.prisma.leaseInventoryItem.findMany({
      where: { leaseId },
      orderBy: { createdAt: 'asc' },
    });

    const content = this.handoverActTemplate({
      propertyAddress: lease.property.address,
      items: items.map((item, index) => ({
        position: index + 1,
        type: item.type,
        brand: item.brand ?? '—',
        model: item.model ?? '—',
        quantity: item.quantity,
      })),
      city: 'Москва',
      generatedDate: this.formatRuDate(new Date()),
    });

    return this.saveNextVersion(
      leaseId,
      LeaseDocumentKind.handover_act,
      content,
      userId,
    );
  }

  async getLatestHandoverAct(
    userId: string,
    leaseId: string,
  ): Promise<LeaseDocument> {
    return this.getLatestOfKind(
      userId,
      leaseId,
      LeaseDocumentKind.handover_act,
      'Акт приёма-передачи имущества ещё не сгенерирован',
    );
  }

  private async getLatestOfKind(
    userId: string,
    leaseId: string,
    kind: LeaseDocumentKind,
    notFoundMessage: string,
  ): Promise<LeaseDocument> {
    await this.leases.getForUser(userId, leaseId); // доступ стороны договора
    const doc = await this.prisma.leaseDocument.findFirst({
      where: { leaseId, kind },
      orderBy: { version: 'desc' },
    });
    if (!doc) {
      throw new NotFoundException(notFoundMessage);
    }
    return doc;
  }

  private async saveNextVersion(
    leaseId: string,
    kind: LeaseDocumentKind,
    content: string,
    generatedById: string,
  ): Promise<LeaseDocument> {
    const last = await this.prisma.leaseDocument.findFirst({
      where: { leaseId, kind },
      orderBy: { version: 'desc' },
    });
    return this.prisma.leaseDocument.create({
      data: {
        leaseId,
        kind,
        version: (last?.version ?? 0) + 1,
        content,
        generatedById,
      },
    });
  }

  private formatRuDate(date: Date): string {
    return `«${date.getUTCDate()}» ${RU_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} г.`;
  }

  private monthsBetween(start: Date, end: Date): number {
    let months =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth());
    if (end.getUTCDate() < start.getUTCDate()) {
      months -= 1;
    }
    return Math.max(months, 0);
  }
}
