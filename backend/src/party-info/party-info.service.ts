import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LeaseParty,
  LeaseStatus,
  MaintenanceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PartyInfoDto,
  PartyInfoStatusView,
  PartyInfoView,
  SavePartyInfoDto,
} from './dto/party-info.dto';
import { PRIVACY_POLICY_VERSION } from '../legal/privacy-policy.const';

const RETENTION_YEARS = 3; // Срок исковой давности, ГК РФ ст. 196 (ADR-0021).

type LeaseWithAddress = Prisma.LeaseGetPayload<{
  include: { property: { select: { address: true } } };
}>;

export function parseBirthDate(
  value: string,
  now: Date = new Date(),
): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new BadRequestException('Дата рождения указана неверно');
  }

  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    throw new BadRequestException('Дата рождения указана неверно');
  }

  const today = {
    y: now.getUTCFullYear(),
    m: now.getUTCMonth() + 1,
    d: now.getUTCDate(),
  };
  if (
    y > today.y ||
    (y === today.y && m > today.m) ||
    (y === today.y && m === today.m && d > today.d)
  ) {
    throw new BadRequestException('Дата рождения указана неверно');
  }

  let age = today.y - y;
  if (today.m < m || (today.m === m && today.d < d)) {
    age -= 1;
  }
  if (age < 18) {
    throw new BadRequestException(
      'Сторона договора должна быть совершеннолетней',
    );
  }
  if (age > 120) {
    throw new BadRequestException('Дата рождения указана неверно');
  }

  return { y, m, d };
}

@Injectable()
export class PartyInfoService {
  private readonly logger = new Logger(PartyInfoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly notifications: NotificationsService,
  ) {}

  // Вносит/обновляет только собственную запись стороны; согласие хранится
  // отдельно от шифрованного payload, чтобы его можно было проверить.
  async upsert(
    userId: string,
    leaseId: string,
    dto: SavePartyInfoDto,
  ): Promise<{ leaseId: string; role: LeaseParty }> {
    const { lease, role } = await this.resolveParty(userId, leaseId);
    if (lease.status === LeaseStatus.terminated) {
      throw new ForbiddenException(
        'Договор расторгнут — персональные данные больше нельзя изменить',
      );
    }

    parseBirthDate(dto.birthDate);

    const existing = await this.prisma.leasePartyInfo.findUnique({
      where: { leaseId_role: { leaseId, role } },
    });
    const needsConsent =
      !existing ||
      !existing.consentAcceptedAt ||
      existing.consentPolicyVersion !== PRIVACY_POLICY_VERSION;

    if (needsConsent && dto.consentAccepted !== true) {
      throw new BadRequestException(
        'Нужно согласие на обработку персональных данных',
      );
    }
    if (needsConsent && dto.policyVersion !== PRIVACY_POLICY_VERSION) {
      throw new ConflictException(
        'Политика обработки данных обновилась — обновите страницу',
      );
    }

    const payload: PartyInfoDto = {
      passportSeries: dto.passportSeries,
      passportNumber: dto.passportNumber,
      passportIssuedBy: dto.passportIssuedBy,
      birthDate: dto.birthDate,
      registrationAddress: dto.registrationAddress,
      ...(dto.phone ? { phone: dto.phone } : {}),
    };
    const payloadJson = JSON.stringify(payload);
    const changed =
      !existing || this.crypto.decrypt(existing.dataEnc) !== payloadJson;

    if (!changed && !needsConsent) {
      return { leaseId, role };
    }

    const dataEnc = this.crypto.encrypt(payloadJson);
    const consentData = needsConsent
      ? {
          consentAcceptedAt: new Date(),
          consentPolicyVersion: PRIVACY_POLICY_VERSION,
        }
      : {};
    await this.prisma.leasePartyInfo.upsert({
      where: { leaseId_role: { leaseId, role } },
      create: {
        leaseId,
        role,
        enteredById: userId,
        dataEnc,
        ...consentData,
      },
      update: { dataEnc, enteredById: userId, ...consentData },
    });

    if (changed) {
      await this.notifyCounterparty(lease, role);
    }
    return { leaseId, role };
  }

  async getOwn(userId: string, leaseId: string): Promise<PartyInfoView> {
    const { role } = await this.resolveParty(userId, leaseId);
    return this.readRole(leaseId, role);
  }

  async getAsSuperAdmin(
    leaseId: string,
    role: LeaseParty,
  ): Promise<PartyInfoView> {
    return this.readRole(leaseId, role);
  }

  async getStatus(
    userId: string,
    leaseId: string,
  ): Promise<PartyInfoStatusView> {
    const { role } = await this.resolveParty(userId, leaseId);
    const rows = await this.prisma.leasePartyInfo.findMany({
      where: { leaseId },
      select: {
        role: true,
        updatedAt: true,
        consentAcceptedAt: true,
        consentPolicyVersion: true,
      },
    });
    const byRole = new Map(rows.map((row) => [row.role, row]));
    const self = byRole.get(role);
    const counterpartyRole =
      role === LeaseParty.landlord ? LeaseParty.tenant : LeaseParty.landlord;
    const counterparty = byRole.get(counterpartyRole);

    return {
      role,
      currentPolicyVersion: PRIVACY_POLICY_VERSION,
      self: {
        filled: Boolean(self?.consentAcceptedAt),
        updatedAt: self?.updatedAt.toISOString() ?? null,
        needsConsent:
          !self ||
          !self.consentAcceptedAt ||
          self.consentPolicyVersion !== PRIVACY_POLICY_VERSION,
      },
      counterparty: {
        filled: Boolean(counterparty?.consentAcceptedAt),
        updatedAt: counterparty?.updatedAt.toISOString() ?? null,
      },
    };
  }

  private async readRole(
    leaseId: string,
    role: LeaseParty,
  ): Promise<PartyInfoView> {
    const info = await this.prisma.leasePartyInfo.findUnique({
      where: { leaseId_role: { leaseId, role } },
    });
    if (!info) {
      throw new NotFoundException('Персональные данные не заполнены');
    }
    const data = JSON.parse(this.crypto.decrypt(info.dataEnc)) as PartyInfoDto;
    return {
      ...data,
      consentAcceptedAt: info.consentAcceptedAt?.toISOString() ?? null,
      consentPolicyVersion: info.consentPolicyVersion,
      currentPolicyVersion: PRIVACY_POLICY_VERSION,
      updatedAt: info.updatedAt.toISOString(),
    };
  }

  private async notifyCounterparty(
    lease: LeaseWithAddress,
    role: LeaseParty,
  ): Promise<void> {
    const recipientId =
      role === LeaseParty.landlord ? lease.tenantId : lease.landlordId;
    if (!recipientId) {
      return;
    }

    const input =
      role === LeaseParty.tenant
        ? {
            type: 'party_info_submitted',
            title: 'Арендатор внёс персональные данные',
            body: `По договору на объект «${lease.property.address}» вторая сторона внесла свои паспортные данные. Если текст договора уже сгенерирован — перегенерируйте его, иначе в нём останутся прочерки.`,
          }
        : {
            type: 'party_info_submitted',
            title: 'Собственник внёс персональные данные',
            body: `По договору на объект «${lease.property.address}» вторая сторона внесла свои паспортные данные.`,
          };
    try {
      await this.notifications.notify(recipientId, input);
    } catch (error) {
      // Сохранённые данные не откатываются из-за best-effort-канала.
      this.logger.warn(
        `Не удалось уведомить вторую сторону договора ${lease.id}: ${String(error)}`,
      );
    }
  }

  // Ретеншен ПДн (ADR-0021): удаляет LeasePartyInfo для договоров,
  // завершённых более RETENTION_YEARS лет назад. Пауза при активном споре —
  // если по договору есть незакрытая заявка на обслуживание, удаление
  // откладывается до её закрытия.
  async runRetention(now: Date = new Date()): Promise<{ deleted: number }> {
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);

    const candidates = await this.prisma.lease.findMany({
      where: {
        status: LeaseStatus.terminated,
        partyInfo: { some: {} },
      },
      select: {
        id: true,
        endDate: true,
        effectiveEndDate: true,
        maintenanceRequests: {
          where: {
            status: {
              in: [MaintenanceStatus.open, MaintenanceStatus.in_progress],
            },
          },
          select: { id: true },
        },
      },
    });

    let deleted = 0;
    for (const lease of candidates) {
      const endedAt = lease.effectiveEndDate ?? lease.endDate;
      if (endedAt > cutoff || lease.maintenanceRequests.length > 0) {
        continue;
      }
      const { count } = await this.prisma.leasePartyInfo.deleteMany({
        where: { leaseId: lease.id },
      });
      deleted += count;
    }
    return { deleted };
  }

  private async resolveParty(
    userId: string,
    leaseId: string,
  ): Promise<{ lease: LeaseWithAddress; role: LeaseParty }> {
    const lease = await this.prisma.lease.findUnique({
      where: { id: leaseId },
      include: { property: { select: { address: true } } },
    });
    if (!lease) {
      throw new NotFoundException('Договор не найден');
    }
    if (lease.landlordId === userId) {
      return { lease, role: LeaseParty.landlord };
    }
    if (lease.tenantId === userId) {
      return { lease, role: LeaseParty.tenant };
    }
    throw new NotFoundException('Договор не найден');
  }
}
