import { Module } from '@nestjs/common';
import { LeasesModule } from '../leases/leases.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TerminationService } from './termination.service';
import { TerminationController } from './termination.controller';

@Module({
  imports: [LeasesModule, BillingModule, NotificationsModule],
  controllers: [TerminationController],
  providers: [TerminationService],
})
export class TerminationModule {}
