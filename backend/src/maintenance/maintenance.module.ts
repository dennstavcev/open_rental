import { Module } from '@nestjs/common';
import { LeasesModule } from '../leases/leases.module';
import { BillingModule } from '../billing/billing.module';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';

@Module({
  imports: [LeasesModule, BillingModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
