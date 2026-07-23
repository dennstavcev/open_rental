import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Lease, LeaseParty, LeaseSignedScan, LeaseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '../storage/storage-provider.interface';
import { NotificationsService } from '../notifications/notifications.service';

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class LeaseSignedScansService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
    private readonly notifications: NotificationsService,
  ) {}

  async upload(
    userId: string,
    leaseId: string,
    file: UploadedFile,
  ): Promise<{ scan: LeaseSignedScan; lease: Lease; activated: boolean }> {
    const ext = ALLOWED_MIME[file.mimetype];
    if (!ext) {
      throw new BadRequestException(
        'Допустимы только файлы JPEG, PNG или PDF',
      );
    }

    const { lease, role } = await this.resolveParty(userId, leaseId);
    if (lease.status !== LeaseStatus.sent) {
      throw new ConflictException(
        lease.status === LeaseStatus.draft
          ? 'Договор ещё не отправлен арендатору'
          : 'Договор уже заключён',
      );
    }

    // Замена своего скана — удаляем старый файл из хранилища.
    const existing = await this.prisma.leaseSignedScan.findUnique({
      where: { leaseId_role: { leaseId, role } },
    });
    if (existing) {
      await this.storage.delete(existing.storageKey);
    }

    const storageKey = `leases/${leaseId}/signed-${role}-${randomUUID()}.${ext}`;
    await this.storage.put(storageKey, file.buffer, file.mimetype);

    const scan = await this.prisma.leaseSignedScan.upsert({
      where: { leaseId_role: { leaseId, role } },
      create: {
        leaseId,
        uploadedById: userId,
        role,
        storageKey,
        mimeType: file.mimetype,
      },
      update: {
        uploadedById: userId,
        storageKey,
        mimeType: file.mimetype,
        confirmedAt: new Date(),
      },
    });

    const activatedLease = await this.maybeActivate(lease);
    return {
      scan,
      lease: activatedLease ?? lease,
      activated: activatedLease !== null,
    };
  }

  async list(userId: string, leaseId: string): Promise<LeaseSignedScan[]> {
    await this.resolveParty(userId, leaseId);
    return this.prisma.leaseSignedScan.findMany({
      where: { leaseId },
      orderBy: { confirmedAt: 'asc' },
    });
  }

  async download(
    userId: string,
    leaseId: string,
    scanId: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    await this.resolveParty(userId, leaseId);
    const scan = await this.prisma.leaseSignedScan.findFirst({
      where: { id: scanId, leaseId },
    });
    if (!scan) {
      throw new NotFoundException('Скан не найден');
    }
    return {
      buffer: await this.storage.get(scan.storageKey),
      mimeType: scan.mimeType,
    };
  }

  // Удаление скана — только SuperAdmin (docs/ARCHITECTURE.md: документы
  // удаляет только системная роль).
  async deleteAsSuperAdmin(scanId: string): Promise<void> {
    const scan = await this.prisma.leaseSignedScan.findUnique({
      where: { id: scanId },
    });
    if (!scan) {
      throw new NotFoundException('Скан не найден');
    }
    await this.storage.delete(scan.storageKey);
    await this.prisma.leaseSignedScan.delete({ where: { id: scanId } });
  }

  // Определяет сторону договора для пользователя (или 404, если не сторона).
  private async resolveParty(
    userId: string,
    leaseId: string,
  ): Promise<{ lease: Lease; role: LeaseParty }> {
    const lease = await this.prisma.lease.findUnique({
      where: { id: leaseId },
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

  // Активирует договор, если сканы есть у обеих сторон. Возвращает
  // обновлённый Lease или null, если активация ещё не наступила.
  private async maybeActivate(lease: Lease): Promise<Lease | null> {
    const roles = await this.prisma.leaseSignedScan.findMany({
      where: { leaseId: lease.id },
      select: { role: true },
    });
    const hasBoth =
      roles.some((r) => r.role === LeaseParty.landlord) &&
      roles.some((r) => r.role === LeaseParty.tenant);
    if (!hasBoth) {
      return null;
    }

    // Защитная проверка инварианта: другого активного договора на объект нет.
    const otherActive = await this.prisma.lease.findFirst({
      where: {
        propertyId: lease.propertyId,
        status: LeaseStatus.active,
        id: { not: lease.id },
      },
    });
    if (otherActive) {
      throw new ConflictException(
        'По объекту уже есть другой активный договор',
      );
    }

    const activated = await this.prisma.lease.update({
      where: { id: lease.id },
      data: { status: LeaseStatus.active },
    });

    // Уведомляем обе стороны о заключении договора.
    for (const uid of [lease.landlordId, lease.tenantId].filter(
      (x): x is string => !!x,
    )) {
      await this.notifications.notify(uid, {
        type: 'lease_activated',
        title: 'Договор заключён',
        body: 'Сканы загружены обеими сторонами — договор действует.',
      });
    }
    return activated;
  }
}
