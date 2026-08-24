import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Lease } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { LeaseReturnActService } from './lease-return-act.service';

@Controller('leases/:leaseId/return-act')
@UseGuards(JwtAuthGuard)
export class LeaseReturnActController {
  constructor(private readonly returnAct: LeaseReturnActService) {}

  @Post('submit')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<Lease> {
    return this.returnAct.submit(user.id, leaseId);
  }

  @Post('confirm')
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<Lease> {
    return this.returnAct.confirm(user.id, leaseId);
  }
}
