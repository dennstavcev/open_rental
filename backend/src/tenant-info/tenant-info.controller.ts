import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { TenantInfoService } from './tenant-info.service';
import { TenantInfoDto } from './dto/tenant-info.dto';

@Controller('leases/:leaseId/tenant-info')
@UseGuards(JwtAuthGuard)
export class TenantInfoController {
  constructor(private readonly tenantInfo: TenantInfoService) {}

  @Put()
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Body() dto: TenantInfoDto,
  ): Promise<{ leaseId: string }> {
    return this.tenantInfo.upsert(user.id, leaseId, dto);
  }

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<TenantInfoDto> {
    return this.tenantInfo.get(user, leaseId);
  }
}
