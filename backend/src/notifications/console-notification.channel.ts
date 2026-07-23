import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  OutboundNotification,
} from './notification-channel.interface';

// Dev/тест-заглушка: пишет уведомление в лог вместо реальной отправки.
// Прод-провайдер (email/SMS) заменит эту реализацию без изменений в
// потребителях.
@Injectable()
export class ConsoleNotificationChannel implements NotificationChannel {
  private readonly logger = new Logger('Notification');

  async send(message: OutboundNotification): Promise<void> {
    this.logger.log(`→ ${message.to}: ${message.subject} — ${message.body}`);
  }
}
