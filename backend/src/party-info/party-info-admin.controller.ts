import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { LeaseParty } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { PartyInfoService } from './party-info.service';
import { PartyInfoView } from './dto/party-info.dto';

// Чтение персональных данных любой стороны договора — только SuperAdmin
// (споры/проверки, ADR-0021). Записывать за пользователя нельзя — только
// сама сторона через PartyInfoController.
@Controller('lease-party-info')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class PartyInfoAdminController {
  constructor(private readonly partyInfo: PartyInfoService) {}

  @Get(':leaseId/:role')
  get(
    @Param('leaseId') leaseId: string,
    @Param('role') role: LeaseParty,
  ): Promise<PartyInfoView> {
    return this.partyInfo.getAsSuperAdmin(leaseId, role);
  }
}
