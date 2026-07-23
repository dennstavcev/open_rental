import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationChannel } from './notification-channel.interface';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;
  let channel: jest.Mocked<NotificationChannel>;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'u@mail.ru' }) },
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'n1' }),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'n1', ...data })),
      },
    };
    channel = { send: jest.fn() };
    service = new NotificationsService(prisma as unknown as PrismaService, channel);
  });

  it('персистит уведомление и отправляет через канал', async () => {
    await service.notify('u1', { type: 't', title: 'Заголовок', body: 'Текст' });
    expect(prisma.notification.create).toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalledWith({
      to: 'u@mail.ru',
      subject: 'Заголовок',
      body: 'Текст',
    });
  });

  it('сбой канала не ломает вызов (best-effort)', async () => {
    channel.send.mockRejectedValue(new Error('smtp down'));
    await expect(
      service.notify('u1', { type: 't', title: 'x', body: 'y' }),
    ).resolves.toMatchObject({ id: 'n1' });
  });

  it('markRead чужого уведомления → NotFound', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(service.markRead('u1', 'n-foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
