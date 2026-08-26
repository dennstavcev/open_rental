import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Lease,
  LeaseStatus,
  MaintenanceRequest,
  MaintenanceStatus,
  ServiceType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from '../leases/leases.service';
import { BillingService } from '../billing/billing.service';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '../storage/storage-provider.interface';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { ProposeSettlementDto } from './dto/propose-settlement.dto';

const ALLOWED_PHOTO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export interface RequestPhoto {
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: LeasesService,
    private readonly billing: BillingService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  // Обычную заявку создаёт только tenant (docs/ARCHITECTURE.md).
  async create(
    userId: string,
    leaseId: string,
    dto: CreateMaintenanceDto,
    photo?: RequestPhoto,
  ): Promise<MaintenanceRequest> {
    const lease = await this.leases.getForUser(userId, leaseId);
    if (lease.tenantId !== userId) {
      throw new ForbiddenException('Заявку может создать только арендатор');
    }
    if (lease.status !== LeaseStatus.active) {
      throw new ConflictException(
        'Договор не действует — новые заявки недоступны',
      );
    }

    let photoStorageKey: string | undefined;
    if (photo) {
      const ext = ALLOWED_PHOTO[photo.mimetype];
      if (!ext) {
        throw new BadRequestException('Фото должно быть JPEG, PNG или PDF');
      }
      photoStorageKey = `maintenance/${leaseId}/${randomUUID()}.${ext}`;
      await this.storage.put(photoStorageKey, photo.buffer, photo.mimetype);
    }

    return this.prisma.maintenanceRequest.create({
      data: {
        leaseId,
        createdById: userId,
        category: dto.category,
        description: dto.description,
        photoStorageKey,
      },
    });
  }

  async list(
    userId: string,
    leaseId: string,
  ): Promise<
    Array<
      MaintenanceRequest & { service: { id: string; billedAt: Date | null } | null }
    >
  > {
    await this.leases.getForUser(userId, leaseId);
    return this.prisma.maintenanceRequest.findMany({
      where: { leaseId },
      include: { service: { select: { id: true, billedAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(
    userId: string,
    id: string,
    status: MaintenanceStatus,
  ): Promise<MaintenanceRequest> {
    const { request, lease } = await this.load(userId, id);
    if (lease.landlordId !== userId) {
      throw new ForbiddenException('Статус меняет только собственник');
    }
    if (lease.status !== LeaseStatus.active) {
      throw new ConflictException(
        'Договор не действует — заявку нельзя изменить',
      );
    }
    if (status === MaintenanceStatus.resolved) {
      const service = await this.prisma.service.findUnique({
        where: { sourceRequestId: request.id },
      });
      if (service && service.billedAt === null) {
        // Только заявка с неоплаченной услугой требует текущий черновик.
        await this.billing.ensureCurrentDraft(lease);
        return this.billing.resolveRequestWithService(lease, request, service);
      }
    }
    return this.prisma.maintenanceRequest.update({
      where: { id: request.id },
      data: { status },
    });
  }

  // Предложение суммы урегулирования любой стороной. Сбрасывает
  // подтверждения; подтверждается только сторона-инициатор.
  async proposeSettlement(
    userId: string,
    id: string,
    dto: ProposeSettlementDto,
  ): Promise<MaintenanceRequest> {
    const { request, lease } = await this.load(userId, id);
    if (lease.status !== LeaseStatus.active) {
      throw new ConflictException(
        'Договор не действует — сумму по заявке нельзя предложить',
      );
    }
    if (request.settlementAppliedAt) {
      throw new ConflictException('Сумма уже согласована и применена');
    }
    const isTenant = lease.tenantId === userId;
    return this.prisma.maintenanceRequest.update({
      where: { id: request.id },
      data: {
        settlementAmount: dto.amount,
        settlementPayer: dto.payer,
        confirmedByTenant: isTenant,
        confirmedByLandlord: !isTenant,
      },
    });
  }

  // Подтверждение суммы второй стороной. Согласованная заявка создаёт
  // разовую услугу; начисление ждёт фактического закрытия заявки.
  async confirmSettlement(
    userId: string,
    id: string,
  ): Promise<MaintenanceRequest> {
    const { request, lease } = await this.load(userId, id);
    if (lease.status !== LeaseStatus.active) {
      throw new ConflictException(
        'Договор не действует — сумму по заявке нельзя согласовать',
      );
    }
    if (request.settlementAppliedAt) {
      throw new ConflictException('Сумма уже согласована и применена');
    }
    if (request.settlementAmount === null || !request.settlementPayer) {
      throw new ConflictException('Сумма ещё не предложена');
    }

    const isTenant = lease.tenantId === userId;
    const confirmedByTenant = request.confirmedByTenant || isTenant;
    const confirmedByLandlord = request.confirmedByLandlord || !isTenant;

    if (!(confirmedByTenant && confirmedByLandlord)) {
      // Пока подтвердила лишь одна сторона — только фиксируем подтверждение.
      return this.prisma.maintenanceRequest.update({
        where: { id: request.id },
        data: { confirmedByTenant, confirmedByLandlord },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const appliedAt = new Date();
      const claimed = await tx.maintenanceRequest.updateMany({
        where: { id: request.id, settlementAppliedAt: null },
        data: {
          confirmedByTenant: true,
          confirmedByLandlord: true,
          settlementAppliedAt: appliedAt,
        },
      });
      if (claimed.count === 1) {
        await tx.service.create({
          data: {
            propertyId: lease.propertyId,
            name: `Заявка: ${request.category}`,
            price: request.settlementAmount!,
            serviceType: ServiceType.one_time,
            payer: request.settlementPayer!,
            sourceRequestId: request.id,
            description: request.description.slice(0, 300),
            billedAt: null,
          },
        });
      }
      const updated = await tx.maintenanceRequest.findUnique({
        where: { id: request.id },
      });
      if (!updated) {
        throw new NotFoundException('Заявка не найдена');
      }
      return updated;
    });
  }

  private async load(
    userId: string,
    id: string,
  ): Promise<{ request: MaintenanceRequest; lease: Lease }> {
    const request = await this.prisma.maintenanceRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException('Заявка не найдена');
    }
    // getForUser бросит 404, если пользователь не сторона договора.
    const lease = await this.leases.getForUser(userId, request.leaseId);
    return { request, lease };
  }
}
