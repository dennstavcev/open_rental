import { Module } from '@nestjs/common';
import { LeasesModule } from '../leases/leases.module';
import { BillingModule } from '../billing/billing.module';
import { TerminationService } from './termination.service';
import { TerminationController } from './termination.controller';

@Module({
  imports: [LeasesModule, BillingModule],
  controllers: [TerminationController],
  providers: [TerminationService],
})
export class TerminationModule {}
