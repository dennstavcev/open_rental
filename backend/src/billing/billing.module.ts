import { Module } from '@nestjs/common';
import { LeasesModule } from '../leases/leases.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingScheduler } from './billing.scheduler';

@Module({
  imports: [LeasesModule, NotificationsModule],
  controllers: [BillingController],
  providers: [BillingService, BillingScheduler],
  exports: [BillingService],
})
export class BillingModule {}
