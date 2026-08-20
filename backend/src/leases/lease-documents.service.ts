import { Injectable, NotFoundException } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { LeaseDocument, LeaseDocumentKind, LeaseParty } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from './leases.service';
import { CryptoService } from '../crypto/crypto.service';
import { toNumber } from '../billing/billing.util';
import { LEASE_CONTRACT_TEMPLATE } from './templates/lease-contract.template';
import { LEASE_HANDOVER_ACT_TEMPLATE } from './templates/lease-handover-act.template';
import { PartyInfoDto } from '../party-info/dto/party-info.dto';

const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

// Прочерки для незаполненных персональных полей (ADR-0021) — по длине как
// в исходном шаблоне dogovor_arendy.docx.
const BLANK_NAME = '____________________';
const BLANK_ADDRESS = '____________________';
const BLANK_SERIES = '______';
const BLANK_NUMBER = '_________';
const BLANK_ISSUED_BY = '____________________';
const BLANK_PHONE = '________';

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
    private readonly crypto: CryptoService,
  ) {}

  // Генерация новой версии текста договора (только landlord). Подставляет
  // персональные данные сторон из LeasePartyInfo, если внесены (ADR-0021,
  // отменяет ADR-0017); незаполненные поля — прочерк для заполнения от руки.
  async generate(userId: string, leaseId: string): Promise<LeaseDocument> {
    const lease = await this.prisma.lease.findUnique({
      where: { id: leaseId },
      include: { property: true, landlord: true, tenant: true },
    });
    if (!lease || lease.landlordId !== userId) {
      throw new NotFoundException('Договор не найден');
    }

    const partyInfo = await this.loadPartyInfo(leaseId);

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
      landlordFullName: lease.landlord.fullName,
      tenantFullName: lease.tenant?.fullName ?? BLANK_NAME,
      ...this.partyTemplateFields('landlord', partyInfo.landlord),
      ...this.partyTemplateFields('tenant', partyInfo.tenant),
    });

    return this.saveNextVersion(
      leaseId,
      LeaseDocumentKind.contract,
      content,
      userId,
    );
  }

  // Читает и расшифровывает LeasePartyInfo обеих сторон договора (если
  // внесены). Читает таблицу напрямую (не через PartyInfoService), чтобы не
  // вводить зависимость модуля leases от party-info — по аналогии с тем, как
  // billing.service.ts напрямую читает таблицы meters (см. комментарий там).
  private async loadPartyInfo(
    leaseId: string,
  ): Promise<{ landlord: PartyInfoDto | null; tenant: PartyInfoDto | null }> {
    const rows = await this.prisma.leasePartyInfo.findMany({
      where: { leaseId },
    });
    const byRole = new Map(rows.map((row) => [row.role, row]));
    const decrypt = (role: LeaseParty): PartyInfoDto | null => {
      const row = byRole.get(role);
      if (!row) {
        return null;
      }
      return JSON.parse(this.crypto.decrypt(row.dataEnc)) as PartyInfoDto;
    };
    return {
      landlord: decrypt(LeaseParty.landlord),
      tenant: decrypt(LeaseParty.tenant),
    };
  }

  // Строит поля шаблона для одной стороны (landlord/tenant) с прочерком
  // вместо незаполненных значений.
  private partyTemplateFields(
    prefix: 'landlord' | 'tenant',
    data: PartyInfoDto | null,
  ): Record<string, string> {
    return {
      [`${prefix}RegistrationAddress`]: data?.registrationAddress ?? BLANK_ADDRESS,
      [`${prefix}PassportSeries`]: data?.passportSeries ?? BLANK_SERIES,
      [`${prefix}PassportNumber`]: data?.passportNumber ?? BLANK_NUMBER,
      [`${prefix}PassportIssuedBy`]: data?.passportIssuedBy ?? BLANK_ISSUED_BY,
      [`${prefix}Phone`]: data?.phone ?? BLANK_PHONE,
    };
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
  // (ADR-0018, не затронут пересмотром ADR-0017→ADR-0021). Опись берётся
  // из LeaseInventoryItem на момент генерации; персональные данные сторон
  // здесь по-прежнему не участвуют — только описание передаваемых вещей.
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
