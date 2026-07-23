import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MaintenanceRequest } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { MaintenanceService, RequestPhoto } from './maintenance.service';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ProposeSettlementDto } from './dto/propose-settlement.dto';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

@Controller()
@UseGuards(JwtAuthGuard)
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Post('leases/:leaseId/maintenance-requests')
  @UseInterceptors(
    FileInterceptor('photo', { limits: { fileSize: MAX_PHOTO_BYTES } }),
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Body() dto: CreateMaintenanceDto,
    @UploadedFile() photo: RequestPhoto | undefined,
  ): Promise<MaintenanceRequest> {
    return this.maintenance.create(user.id, leaseId, dto, photo);
  }

  @Get('leases/:leaseId/maintenance-requests')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<MaintenanceRequest[]> {
    return this.maintenance.list(user.id, leaseId);
  }

  @Patch('maintenance-requests/:id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ): Promise<MaintenanceRequest> {
    return this.maintenance.updateStatus(user.id, id, dto.status);
  }

  @Post('maintenance-requests/:id/settlement')
  proposeSettlement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ProposeSettlementDto,
  ): Promise<MaintenanceRequest> {
    return this.maintenance.proposeSettlement(user.id, id, dto);
  }

  @Post('maintenance-requests/:id/settlement/confirm')
  confirmSettlement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MaintenanceRequest> {
    return this.maintenance.confirmSettlement(user.id, id);
  }
}
