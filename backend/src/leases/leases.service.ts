import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Invitation,
  InvitationStatus,
  Lease,
  LeaseStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';

// Приглашение вместе с контекстом: кто пригласил и на какой объект. Без
// этого в карточке приглашения нечего показать, кроме email самого
// приглашённого — он и так знает свой email.
// Договор вместе с тем, что нужно показать на экране: объект и контрагент
// (ADR-0020). Раньше отдавался «голый» Lease, и фронт добирал адрес
// отдельным запросом к properties/:id — арендатору это давало 404, потому
// что объект чужой. Персональные данные здесь — данные аккаунта, а не поля
// договора: в LeaseDocument они не подставляются (ADR-0017, граница
// зафиксирована в ADR-0019).
export interface LeasePartyView {
  id: string;
  fullName: string;
  email: string;
}

export interface LeaseInvitationView {
  invitedEmail: string;
  status: InvitationStatus;
  createdAt: Date;
}

export type LeaseView = Lease & {
  property: { id: string; address: string };
  landlord: LeasePartyView;
  tenant: LeasePartyView | null;
  // Только арендодателю: кому отправлено приглашение и что с ним. Нужно,
  // чтобы заметить опечатку в адресе и переотправить (ADR-0020).
  invitation: LeaseInvitationView | null;
};

// Реквизиты арендодателя по договору (ADR-0019) — арендатору, чтобы было
// куда платить. В текст договора не подставляются (ADR-0017).
export interface PayoutDetailsView {
  payoutPhone: string | null;
  payoutBankName: string | null;
  payoutNote: string | null;
  filled: boolean;
}

export type InvitationView = Invitation & {
  landlord: { fullName: string; email: string };
  property: { address: string };
  lease: Pick<Lease, 'startDate' | 'endDate' | 'rentAmount'>;
};

const LEASE_VIEW_INCLUDE = {
  property: { select: { id: true, address: true } },
  landlord: { select: { id: true, fullName: true, email: true } },
  tenant: { select: { id: true, fullName: true, email: true } },
  invitations: { orderBy: { createdAt: 'desc' }, take: 1 },
} as const;

@Injectable()
export class LeasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly notifications: NotificationsService,
  ) {}

  async createDraft(
    landlordId: string,
    propertyId: string,
    dto: CreateLeaseDto,
  ): Promise<Lease> {
    // Владение объектом (404, если чужой).
    await this.properties.findOneForOwner(landlordId, propertyId);

    // Инвариант: не более одного активного договора на объект.
    const active = await this.prisma.lease.findFirst({
      where: { propertyId, status: LeaseStatus.active },
    });
    if (active) {
      throw new ConflictException(
        'По объекту уже есть активный договор',
      );
    }

    return this.prisma.lease.create({
      data: {
        propertyId,
        landlordId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        rentAmount: dto.rentAmount,
        depositAmount: dto.depositAmount,
        paymentDay: dto.paymentDay,
        penaltyRatePercentPerDay: dto.penaltyRatePercentPerDay,
      },
    });
  }

  // Договоры, где пользователь — арендодатель ИЛИ арендатор (кабинет
  // видят обе стороны).
  async listForUser(userId: string): Promise<LeaseView[]> {
    const leases = await this.prisma.lease.findMany({
      where: { OR: [{ landlordId: userId }, { tenantId: userId }] },
      orderBy: { createdAt: 'desc' },
      include: LEASE_VIEW_INCLUDE,
    });
    return leases.map((lease) => this.toLeaseView(lease, userId));
  }

  // Договор виден landlord'у и привязанному tenant'у.
  async getForUser(userId: string, leaseId: string): Promise<LeaseView> {
    const lease = await this.prisma.lease.findUnique({
      where: { id: leaseId },
      include: LEASE_VIEW_INCLUDE,
    });
    if (
      !lease ||
      (lease.landlordId !== userId && lease.tenantId !== userId)
    ) {
      throw new NotFoundException('Договор не найден');
    }
    return this.toLeaseView(lease, userId);
  }

  private toLeaseView(
    lease: Lease & {
      property: { id: string; address: string };
      landlord: LeasePartyView;
      tenant: LeasePartyView | null;
      invitations: Invitation[];
    },
    userId: string,
  ): LeaseView {
    const { invitations, ...rest } = lease;
    const latest = invitations[0];
    return {
      ...rest,
      // Историю приглашений видит только тот, кто их отправлял.
      invitation:
        latest && lease.landlordId === userId
          ? {
              invitedEmail: latest.invitedEmail,
              status: latest.status,
              createdAt: latest.createdAt,
            }
          : null,
    };
  }

  async updateDraft(
    landlordId: string,
    leaseId: string,
    dto: UpdateLeaseDto,
  ): Promise<Lease> {
    const lease = await this.getOwnedDraft(landlordId, leaseId);
    return this.prisma.lease.update({
      where: { id: lease.id },
      data: {
        ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.rentAmount !== undefined
          ? { rentAmount: dto.rentAmount }
          : {}),
        ...(dto.depositAmount !== undefined
          ? { depositAmount: dto.depositAmount }
          : {}),
        ...(dto.paymentDay !== undefined
          ? { paymentDay: dto.paymentDay }
          : {}),
        ...(dto.penaltyRatePercentPerDay !== undefined
          ? { penaltyRatePercentPerDay: dto.penaltyRatePercentPerDay }
          : {}),
      },
    });
  }

  // Отправка договора арендатору: draft → sent + приглашение по email.
  // Повторная отправка по уже отправленному договору (пока арендатор не
  // привязан) — способ исправить опечатку в адресе: прошлое приглашение
  // отзывается, его токен перестаёт работать (ADR-0020).
  async send(
    landlordId: string,
    leaseId: string,
    invitedEmail: string,
  ): Promise<{ lease: Lease; invitation: Invitation }> {
    await this.getOwnedInvitable(landlordId, leaseId);

    // Нельзя пригласить самого себя арендатором (иначе landlord == tenant).
    const landlord = await this.prisma.user.findUnique({
      where: { id: landlordId },
      select: { email: true },
    });
    if (landlord && landlord.email === invitedEmail.toLowerCase()) {
      throw new ConflictException(
        'Нельзя отправить договор самому себе — укажите email арендатора',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: { leaseId, status: InvitationStatus.pending },
        data: { status: InvitationStatus.cancelled },
      });
      const lease = await tx.lease.update({
        where: { id: leaseId },
        data: { status: LeaseStatus.sent },
      });
      const invitation = await tx.invitation.create({
        data: {
          leaseId,
          invitedEmail: invitedEmail.toLowerCase(),
          token: randomUUID(),
        },
      });
      return { lease, invitation };
    });
  }

  // Отзыв приглашения: договор возвращается в черновик, чтобы условия
  // можно было доредактировать перед новой отправкой (ADR-0020).
  async cancelInvitation(
    landlordId: string,
    leaseId: string,
  ): Promise<Lease> {
    const lease = await this.getOwnedInvitable(landlordId, leaseId);
    if (lease.status !== LeaseStatus.sent) {
      throw new ConflictException('Договор ещё не отправлен арендатору');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: { leaseId, status: InvitationStatus.pending },
        data: { status: InvitationStatus.cancelled },
      });
      return tx.lease.update({
        where: { id: leaseId },
        data: { status: LeaseStatus.draft },
      });
    });
  }

  // Приглашения, адресованные текущему пользователю (по email), в ожидании.
  async listMyInvitations(userEmail: string): Promise<InvitationView[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: { invitedEmail: userEmail.toLowerCase(), status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: {
        lease: {
          include: {
            landlord: { select: { fullName: true, email: true } },
            property: { select: { address: true } },
          },
        },
      },
    });
    return invitations.map(({ lease, ...invitation }) => ({
      ...invitation,
      landlord: lease.landlord,
      property: lease.property,
      lease: {
        startDate: lease.startDate,
        endDate: lease.endDate,
        rentAmount: lease.rentAmount,
      },
    }));
  }

  async getPayoutDetails(
    userId: string,
    leaseId: string,
  ): Promise<PayoutDetailsView> {
    const lease = await this.getForUser(userId, leaseId); // сторона договора
    const landlord = await this.prisma.user.findUnique({
      where: { id: lease.landlordId },
      select: {
        payoutPhone: true,
        payoutBankName: true,
        payoutNote: true,
      },
    });
    if (!landlord) {
      throw new NotFoundException('Арендодатель не найден');
    }
    return {
      ...landlord,
      // Флаг для фронта: показывать блок «куда платить» или подсказку
      // арендодателю, что реквизиты не заполнены.
      filled: Boolean(
        landlord.payoutPhone || landlord.payoutBankName || landlord.payoutNote,
      ),
    };
  }

  async acceptInvitation(
    user: { id: string; email: string },
    invitationId: string,
  ): Promise<Lease> {
    const invitation = await this.getPendingInvitationFor(user.email, invitationId);
    const lease = await this.prisma.lease.findUnique({
      where: { id: invitation.leaseId },
    });
    if (!lease) {
      throw new NotFoundException('Договор не найден');
    }
    if (lease.tenantId && lease.tenantId !== user.id) {
      throw new ConflictException('К договору уже привязан арендатор');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: invitationId },
        data: { status: 'accepted' },
      });
      return tx.lease.update({
        where: { id: lease.id },
        data: { tenantId: user.id },
      });
    });

    // Уведомляем арендодателя, что приглашение принято.
    await this.notifications.notify(lease.landlordId, {
      type: 'invitation_accepted',
      title: 'Приглашение принято',
      body: 'Арендатор принял приглашение — загрузите подписанные сканы для заключения договора.',
    });
    return updated;
  }

  async declineInvitation(
    userEmail: string,
    invitationId: string,
  ): Promise<void> {
    await this.getPendingInvitationFor(userEmail, invitationId);
    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'declined' },
    });
  }

  // Договор, по которому landlord ещё может распоряжаться приглашением:
  // черновик или уже отправленный, но не принятый арендатором. Отдельно от
  // getOwnedDraft, чтобы послабление не расползлось на другие действия
  // (ADR-0020).
  private async getOwnedInvitable(
    landlordId: string,
    leaseId: string,
  ): Promise<Lease> {
    const lease = await this.prisma.lease.findUnique({
      where: { id: leaseId },
    });
    if (!lease || lease.landlordId !== landlordId) {
      throw new NotFoundException('Договор не найден');
    }
    if (lease.status !== LeaseStatus.draft && lease.status !== LeaseStatus.sent) {
      throw new ConflictException(
        'Договор уже заключён или расторгнут — приглашение изменить нельзя',
      );
    }
    if (lease.tenantId) {
      throw new ConflictException('К договору уже привязан арендатор');
    }
    return lease;
  }

  // Договор-черновик, принадлежащий landlord'у (иначе 404/403/409).
  // Публичный — переиспользуется модулями, чьи под-ресурсы редактируются
  // только пока договор черновик (например, LeaseInventoryItemsService).
  async getOwnedDraft(
    landlordId: string,
    leaseId: string,
  ): Promise<Lease> {
    const lease = await this.prisma.lease.findUnique({
      where: { id: leaseId },
    });
    if (!lease || lease.landlordId !== landlordId) {
      throw new NotFoundException('Договор не найден');
    }
    if (lease.status !== LeaseStatus.draft) {
      throw new ConflictException(
        'Действие доступно только для договора в статусе черновика',
      );
    }
    return lease;
  }

  private async getPendingInvitationFor(
    userEmail: string,
    invitationId: string,
  ): Promise<Invitation> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation) {
      throw new NotFoundException('Приглашение не найдено');
    }
    // Приглашение адресовано другому email — не показываем, что оно есть.
    if (invitation.invitedEmail !== userEmail.toLowerCase()) {
      throw new ForbiddenException('Приглашение адресовано не вам');
    }
    if (invitation.status !== 'pending') {
      throw new ConflictException('Приглашение уже обработано');
    }
    return invitation;
  }
}
