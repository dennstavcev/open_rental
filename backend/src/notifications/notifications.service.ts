import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Notification } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_CHANNEL,
  NotificationChannel,
} from './notification-channel.interface';

export interface NotifyInput {
  type: string;
  title: string;
  body: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNEL)
    private readonly channel: NotificationChannel,
  ) {}

  // Персистит уведомление и отправляет через канал (best-effort — сбой
  // доставки не ломает вызывающую операцию).
  async notify(userId: string, input: NotifyInput): Promise<Notification> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
      },
    });
    try {
      if (user) {
        await this.channel.send({
          to: user.email,
          subject: input.title,
          body: input.body,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Не удалось доставить уведомление ${notification.id}: ${String(err)}`,
      );
    }
    return notification;
  }

  list(userId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException('Уведомление не найдено');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }
}
