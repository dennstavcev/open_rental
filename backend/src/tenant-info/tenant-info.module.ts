import { Module } from '@nestjs/common';
import { LeasesModule } from '../leases/leases.module';
import { TenantInfoService } from './tenant-info.service';
import { TenantInfoController } from './tenant-info.controller';

@Module({
  imports: [LeasesModule],
  controllers: [TenantInfoController],
  providers: [TenantInfoService],
})
export class TenantInfoModule {}
