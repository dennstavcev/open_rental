import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Notification, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_CHANNEL,
  NotificationChannel,
} from './notification-channel.interface';

export interface NotifyInput {
  type: string;
  title: string;
  body: string;
  leaseId?: string;
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
  async notify(
    userId: string,
    input: NotifyInput,
  ): Promise<Notification | null> {
    try {
      return await this.notifyOrThrow(userId, input);
    } catch (err) {
      this.logger.warn(`Не удалось создать уведомление: ${String(err)}`);
      return null;
    }
  }

  // Уведомление, которое не повторяется, пока предыдущее не прочитано.
  // Инвариант держит partial unique index из миграции
  // add_notification_lease: попытка создать второе непрочитанное
  // message_new по тому же договору падает с P2002, и это штатный исход.
  async notifyOncePerLease(
    userId: string,
    leaseId: string,
    input: NotifyInput,
  ): Promise<Notification | null> {
    try {
      return await this.notifyOrThrow(userId, { ...input, leaseId });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return null;
      }
      this.logger.warn(`Не удалось создать уведомление: ${String(err)}`);
      return null;
    }
  }

  private async notifyOrThrow(
    userId: string,
    input: NotifyInput,
  ): Promise<Notification> {
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
        leaseId: input.leaseId,
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

  // Фильтр по userId не позволяет затронуть чужие строки журнала.
  async markLeaseRead(
    userId: string,
    leaseId: string,
    type?: string,
  ): Promise<{ count: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, leaseId, readAt: null, ...(type ? { type } : {}) },
      data: { readAt: new Date() },
    });
    return { count };
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
