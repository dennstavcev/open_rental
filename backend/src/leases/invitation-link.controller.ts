import { Controller, Get, Header, Param } from '@nestjs/common';
import {
  InvitationByTokenView,
  LeasesService,
} from './leases.service';

// Отдельный публичный контроллер: InvitationsController закрыт JwtAuthGuard.
@Controller('invitations')
export class InvitationLinkController {
  constructor(private readonly leases: LeasesService) {}

  @Get('by-token/:token')
  @Header('Cache-Control', 'no-store')
  byToken(@Param('token') token: string): Promise<InvitationByTokenView> {
    return this.leases.getInvitationByToken(token);
  }
}
