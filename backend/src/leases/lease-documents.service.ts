import { Injectable, NotFoundException } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { LeaseDocument } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from './leases.service';
import { toNumber } from '../billing/billing.util';
import { LEASE_CONTRACT_TEMPLATE } from './templates/lease-contract.template';

const BLANK = '____________________';
const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

@Injectable()
export class LeaseDocumentsService {
  private readonly template = Handlebars.compile(LEASE_CONTRACT_TEMPLATE);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: LeasesService,
  ) {}

  // Генерация новой версии текста договора (только landlord).
  async generate(userId: string, leaseId: string): Promise<LeaseDocument> {
    const lease = await this.prisma.lease.findUnique({
      where: { id: leaseId },
      include: { landlord: true, tenant: true, property: true },
    });
    if (!lease || lease.landlordId !== userId) {
      throw new NotFoundException('Договор не найден');
    }

    const content = this.render({
      landlordFullName: lease.landlord.fullName,
      tenantFullName: lease.tenant?.fullName ?? BLANK,
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
    });

    const last = await this.prisma.leaseDocument.findFirst({
      where: { leaseId },
      orderBy: { version: 'desc' },
    });
    return this.prisma.leaseDocument.create({
      data: {
        leaseId,
        version: (last?.version ?? 0) + 1,
        content,
        generatedById: userId,
      },
    });
  }

  async getLatest(userId: string, leaseId: string): Promise<LeaseDocument> {
    await this.leases.getForUser(userId, leaseId); // доступ стороны договора
    const doc = await this.prisma.leaseDocument.findFirst({
      where: { leaseId },
      orderBy: { version: 'desc' },
    });
    if (!doc) {
      throw new NotFoundException('Текст договора ещё не сгенерирован');
    }
    return doc;
  }

  private render(data: Record<string, string | number>): string {
    return this.template({
      ...data,
      city: 'Москва',
      generatedDate: this.formatRuDate(new Date()),
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
