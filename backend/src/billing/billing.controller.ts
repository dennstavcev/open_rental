import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { BillingService, BillView } from './billing.service';
import { AddLineItemDto } from './dto/add-line-item.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('leases/:leaseId/bills')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<BillView[]> {
    return this.billing.listBills(user.id, leaseId);
  }

  @Post('bills/:billId/line-items')
  addLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId') billId: string,
    @Body() dto: AddLineItemDto,
  ): Promise<BillView> {
    return this.billing.addManualLine(user.id, billId, dto);
  }

  @Post('bills/:billId/finalize')
  @HttpCode(HttpStatus.OK)
  finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId') billId: string,
  ): Promise<BillView> {
    return this.billing.finalize(user.id, billId);
  }

  @Post('bills/:billId/claim-paid')
  @HttpCode(HttpStatus.OK)
  claimPaid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId') billId: string,
  ): Promise<BillView> {
    return this.billing.claimPaid(user.id, billId);
  }

  @Post('bills/:billId/confirm-paid')
  @HttpCode(HttpStatus.OK)
  confirmPaid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId') billId: string,
  ): Promise<BillView> {
    return this.billing.confirmPaid(user.id, billId);
  }

  @Post('bills/:billId/waive-penalty')
  @HttpCode(HttpStatus.OK)
  waivePenalty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId') billId: string,
  ): Promise<BillView> {
    return this.billing.waivePenalty(user.id, billId);
  }
}
