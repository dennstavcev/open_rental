import { MaintenanceStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateStatusDto {
  @IsEnum(MaintenanceStatus)
  status!: MaintenanceStatus;
}
