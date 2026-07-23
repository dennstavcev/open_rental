import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Invitation, Lease } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { LeasesService } from './leases.service';

@Controller('invitations')
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly leases: LeasesService) {}

  // Приглашения, адресованные текущему пользователю (кабинет арендатора).
  @Get()
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<Invitation[]> {
    return this.leases.listMyInvitations(user.email);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Lease> {
    return this.leases.acceptInvitation(
      { id: user.id, email: user.email },
      id,
    );
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.leases.declineInvitation(user.email, id);
  }
}
