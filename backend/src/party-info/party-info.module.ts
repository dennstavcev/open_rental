import { Module } from '@nestjs/common';
import { PartyInfoService } from './party-info.service';
import { PartyInfoController } from './party-info.controller';
import { PartyInfoAdminController } from './party-info-admin.controller';
import { PartyInfoScheduler } from './party-info.scheduler';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PartyInfoController, PartyInfoAdminController],
  providers: [PartyInfoService, PartyInfoScheduler],
  exports: [PartyInfoService],
})
export class PartyInfoModule {}
