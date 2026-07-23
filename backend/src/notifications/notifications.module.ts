import { Module } from '@nestjs/common';
import { NOTIFICATION_CHANNEL } from './notification-channel.interface';
import { ConsoleNotificationChannel } from './console-notification.channel';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATION_CHANNEL, useClass: ConsoleNotificationChannel },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
