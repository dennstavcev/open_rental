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
  MaintenanceRequest,
  MaintenanceStatus,
  SettlementPayer,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from '../leases/leases.service';
import { BillingService } from '../billing/billing.service';
import { round2, toNumber } from '../billing/billing.util';
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

  async list(userId: string, leaseId: string): Promise<MaintenanceRequest[]> {
    await this.leases.getForUser(userId, leaseId);
    return this.prisma.maintenanceRequest.findMany({
      where: { leaseId },
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

  // Подтверждение суммы второй стороной. По двустороннему подтверждению —
  // доля арендатора уходит строкой в текущий черновик счёта.
  async confirmSettlement(
    userId: string,
    id: string,
  ): Promise<MaintenanceRequest> {
    const { request, lease } = await this.load(userId, id);
    if (request.settlementAppliedAt) {
      throw new ConflictException('Сумма уже согласована и применена');
    }
    if (request.settlementAmount === null) {
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

    const tenantShare = this.tenantShare(
      toNumber(request.settlementAmount),
      request.settlementPayer!,
    );
    const updated = await this.prisma.maintenanceRequest.update({
      where: { id: request.id },
      data: {
        confirmedByTenant: true,
        confirmedByLandlord: true,
        settlementAppliedAt: new Date(),
      },
    });
    if (tenantShare > 0) {
      await this.billing.addSettlementLine(lease, {
        title: `Урегулирование: ${request.category}`,
        amount: tenantShare,
        sourceRefId: request.id,
      });
    }
    return updated;
  }

  // Доля арендатора: платит tenant — полностью, split — половина, owner — 0.
  private tenantShare(amount: number, payer: SettlementPayer): number {
    if (payer === SettlementPayer.tenant) {
      return round2(amount);
    }
    if (payer === SettlementPayer.split) {
      return round2(amount / 2);
    }
    return 0;
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
