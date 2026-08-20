import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { LeaseParty } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PartyInfoService } from './party-info.service';
import { PartyInfoDto } from './dto/party-info.dto';

@Controller('leases/:leaseId/party-info')
@UseGuards(JwtAuthGuard)
export class PartyInfoController {
  constructor(private readonly partyInfo: PartyInfoService) {}

  @Put()
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Body() dto: PartyInfoDto,
  ): Promise<{ leaseId: string; role: LeaseParty }> {
    return this.partyInfo.upsert(user.id, leaseId, dto);
  }

  @Get()
  getOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<PartyInfoDto> {
    return this.partyInfo.getOwn(user.id, leaseId);
  }
}
