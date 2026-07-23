import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';

@Module({
  imports: [PropertiesModule],
  controllers: [ServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}
