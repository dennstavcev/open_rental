import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryReturnStatus,
  LeaseInventoryItem,
  LeaseStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from './leases.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { UpdateInventoryReturnDto } from './dto/update-inventory-return.dto';

// Опись имущества, передаваемого по договору (ADR-0018) — рендерится как
// Приложение №1 (см. LeaseDocumentsService). Редактируется только
// landlord'ом, пока договор — черновик (та же граница, что и у самих полей
// Lease, см. LeasesService.updateDraft); обе стороны видят список после
// отправки договора.
@Injectable()
export class LeaseInventoryItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: LeasesService,
  ) {}

  async create(
    landlordId: string,
    leaseId: string,
    dto: CreateInventoryItemDto,
  ): Promise<LeaseInventoryItem> {
    await this.leases.getOwnedDraft(landlordId, leaseId);
    return this.prisma.leaseInventoryItem.create({
      data: {
        leaseId,
        type: dto.type,
        brand: dto.brand,
        model: dto.model,
        quantity: dto.quantity ?? 1,
      },
    });
  }

  async findAll(
    userId: string,
    leaseId: string,
  ): Promise<LeaseInventoryItem[]> {
    await this.leases.getForUser(userId, leaseId); // доступ стороны договора
    return this.prisma.leaseInventoryItem.findMany({
      where: { leaseId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(
    landlordId: string,
    leaseId: string,
    id: string,
    dto: UpdateInventoryItemDto,
  ): Promise<LeaseInventoryItem> {
    await this.leases.getOwnedDraft(landlordId, leaseId);
    const item = await this.prisma.leaseInventoryItem.findFirst({
      where: { id, leaseId },
    });
    if (!item) {
      throw new NotFoundException('Позиция описи не найдена');
    }
    return this.prisma.leaseInventoryItem.update({
      where: { id },
      data: dto,
    });
  }

  // Состояние возврата меняется отдельно от состава описи: только после
  // расторжения и до того, как арендатор зафиксировал денежный результат.
  async updateReturnState(
    landlordId: string,
    leaseId: string,
    id: string,
    dto: UpdateInventoryReturnDto,
  ): Promise<LeaseInventoryItem> {
    await this.leases.getOwnedTerminated(landlordId, leaseId);
    if (
      dto.returnStatus === InventoryReturnStatus.ok &&
      dto.damageAmount != null &&
      dto.damageAmount !== 0
    ) {
      throw new BadRequestException(
        'У позиции без повреждений не может быть суммы ущерба',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM leases WHERE id = ${leaseId} FOR UPDATE`;

      const lease = await tx.lease.findUnique({ where: { id: leaseId } });
      if (!lease || lease.landlordId !== landlordId) {
        throw new NotFoundException('Договор не найден');
      }
      if (lease.status !== LeaseStatus.terminated) {
        throw new ConflictException(
          'Состояние имущества фиксируется после расторжения договора',
        );
      }
      if (lease.returnActConfirmedAt) {
        throw new ConflictException(
          'Акт возврата уже подтверждён и не редактируется',
        );
      }

      const item = await tx.leaseInventoryItem.findFirst({
        where: { id, leaseId },
      });
      if (!item) {
        throw new NotFoundException('Позиция описи не найдена');
      }
      const updated = await tx.leaseInventoryItem.update({
        where: { id },
        data: {
          returnStatus: dto.returnStatus,
          returnNote: dto.returnNote ?? null,
          damageAmount:
            dto.returnStatus === InventoryReturnStatus.ok
              ? null
              : (dto.damageAmount ?? null),
        },
      });
      await tx.lease.update({
        where: { id: leaseId },
        data: { returnActSubmittedAt: null },
      });
      return updated;
    });
  }

  async remove(
    landlordId: string,
    leaseId: string,
    id: string,
  ): Promise<void> {
    await this.leases.getOwnedDraft(landlordId, leaseId);
    const item = await this.prisma.leaseInventoryItem.findFirst({
      where: { id, leaseId },
    });
    if (!item) {
      throw new NotFoundException('Позиция описи не найдена');
    }
    await this.prisma.leaseInventoryItem.delete({ where: { id } });
  }
}
