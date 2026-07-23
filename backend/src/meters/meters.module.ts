import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { BillingModule } from '../billing/billing.module';
import { MetersService } from './meters.service';
import { MetersController } from './meters.controller';
import { MeterReadingsService } from './meter-readings.service';
import { MeterReadingsController } from './meter-readings.controller';

@Module({
  imports: [PropertiesModule, BillingModule],
  controllers: [MetersController, MeterReadingsController],
  providers: [MetersService, MeterReadingsService],
})
export class MetersModule {}
