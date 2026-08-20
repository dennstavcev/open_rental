import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Invitation, Lease } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import {
  LeasesService,
  LeaseView,
  PayoutDetailsView,
} from './leases.service';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { SendLeaseDto } from './dto/send-lease.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class LeasesController {
  constructor(private readonly leases: LeasesService) {}

  @Post('properties/:propertyId/leases')
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
    @Body() dto: CreateLeaseDto,
  ): Promise<Lease> {
    return this.leases.createDraft(user.id, propertyId, dto);
  }

  @Get('leases')
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<LeaseView[]> {
    return this.leases.listForUser(user.id);
  }

  @Get('leases/:id')
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<LeaseView> {
    return this.leases.getForUser(user.id, id);
  }

  // Реквизиты арендодателя по договору (ADR-0019) — видят обе стороны.
  @Get('leases/:id/payout-details')
  payoutDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<PayoutDetailsView> {
    return this.leases.getPayoutDetails(user.id, id);
  }

  @Patch('leases/:id')
  updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeaseDto,
  ): Promise<Lease> {
    return this.leases.updateDraft(user.id, id, dto);
  }

  // Отправка и переотправка приглашения — один эндпоинт: пока арендатор не
  // привязан, повторный вызов отзывает прошлое приглашение и создаёт новое
  // (исправление опечатки в адресе, ADR-0020).
  @Post('leases/:id/send')
  @HttpCode(HttpStatus.OK)
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendLeaseDto,
  ): Promise<{ lease: Lease; invitation: Invitation }> {
    return this.leases.send(user.id, id, dto.invitedEmail);
  }

  @Delete('leases/:id/invitation')
  @HttpCode(HttpStatus.OK)
  cancelInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Lease> {
    return this.leases.cancelInvitation(user.id, id);
  }
}
