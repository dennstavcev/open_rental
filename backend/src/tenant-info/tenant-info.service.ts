import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from '../leases/leases.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { TenantInfoDto } from './dto/tenant-info.dto';

@Injectable()
export class TenantInfoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: LeasesService,
    private readonly crypto: CryptoService,
  ) {}

  // Вводит/обновляет свои паспортные данные — только арендатор договора.
  async upsert(
    userId: string,
    leaseId: string,
    dto: TenantInfoDto,
  ): Promise<{ leaseId: string }> {
    const lease = await this.leases.getForUser(userId, leaseId);
    if (lease.tenantId !== userId) {
      throw new ForbiddenException('Данные вносит только арендатор договора');
    }
    const dataEnc = this.crypto.encrypt(JSON.stringify(dto));
    await this.prisma.tenantInfo.upsert({
      where: { leaseId },
      create: { leaseId, enteredById: userId, dataEnc },
      update: { dataEnc, enteredById: userId },
    });
    return { leaseId };
  }

  // Читают: сам арендатор (свои) или SuperAdmin (любые). Landlord — нет.
  async get(user: AuthenticatedUser, leaseId: string): Promise<TenantInfoDto> {
    const info = await this.prisma.tenantInfo.findUnique({
      where: { leaseId },
    });
    if (!info) {
      throw new NotFoundException('Данные арендатора не заполнены');
    }
    if (!user.isSuperAdmin) {
      const lease = await this.leases.getForUser(user.id, leaseId);
      if (lease.tenantId !== user.id) {
        throw new ForbiddenException('Нет доступа к персональным данным');
      }
    }
    return JSON.parse(this.crypto.decrypt(info.dataEnc)) as TenantInfoDto;
  }
}
