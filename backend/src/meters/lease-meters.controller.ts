import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { MetersService, MeterListItem } from './meters.service';

// Список счётчиков для хаба аренды (ADR-0015) — в отличие от
// properties/:propertyId/meters (landlord-only), сюда пускает и
// арендатора активного договора.
@Controller('leases/:leaseId/meters')
@UseGuards(JwtAuthGuard)
export class LeaseMetersController {
  constructor(private readonly meters: MetersService) {}

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
}
