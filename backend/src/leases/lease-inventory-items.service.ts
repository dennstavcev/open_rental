import { Injectable, NotFoundException } from '@nestjs/common';
import { LeaseInventoryItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from './leases.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

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
