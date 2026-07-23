import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { LeaseSignedScansService } from './lease-signed-scans.service';

// Системное удаление сканов договоров — только SuperAdmin.
@Controller('lease-signed-scans')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class LeaseSignedScansAdminController {
  constructor(private readonly scans: LeaseSignedScansService) {}

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.scans.deleteAsSuperAdmin(id);
  }
}
