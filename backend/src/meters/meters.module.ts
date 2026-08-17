import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { LeasesModule } from '../leases/leases.module';
import { BillingModule } from '../billing/billing.module';
import { MetersService } from './meters.service';
import { MetersController } from './meters.controller';
import { LeaseMetersController } from './lease-meters.controller';
import { MeterReadingsService } from './meter-readings.service';
import { MeterReadingsController } from './meter-readings.controller';

@Module({
  imports: [PropertiesModule, LeasesModule, BillingModule],
  controllers: [MetersController, LeaseMetersController, MeterReadingsController],
  providers: [MetersService, MeterReadingsService],
})
export class MetersModule {}
