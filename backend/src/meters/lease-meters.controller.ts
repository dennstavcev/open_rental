import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { MeterReading } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { MetersService, MeterListItem } from './meters.service';
import { MeterReadingsService } from './meter-readings.service';

// Хаб счётчиков доступен сторонам указанного договора независимо от статуса;
// карточка properties/:propertyId/meters остаётся landlord-only (ADR-0034).
@Controller('leases/:leaseId/meters')
@UseGuards(JwtAuthGuard)
export class LeaseMetersController {
  constructor(
    private readonly meters: MetersService,
    private readonly readings: MeterReadingsService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<{
    periodStart: Date;
    periodEnd: Date;
    meters: (MeterListItem & { currentPeriodSubmitted: boolean })[];
  }> {
    return this.meters.findAllForLease(user.id, leaseId);
  }

  @Get(':meterId/readings')
  listReadings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Param('meterId') meterId: string,
  ): Promise<MeterReading[]> {
    return this.readings.listForLeaseMeter(user.id, leaseId, meterId);
  }
}
