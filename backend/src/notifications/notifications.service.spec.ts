import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationChannel } from './notification-channel.interface';
import { MarkLeaseReadDto } from './dto/mark-lease-read.dto';

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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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

  it('notifyOncePerLease создаёт первое непрочитанное уведомление', async () => {
    await expect(
      service.notifyOncePerLease('u1', 'l1', {
        type: 'message_new',
        title: 'Новое сообщение',
        body: 'Откройте чат.',
      }),
    ).resolves.toMatchObject({ id: 'n1' });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ leaseId: 'l1', type: 'message_new' }),
    });
  });

  it('notifyOncePerLease глушит P2002 partial unique index', async () => {
    prisma.notification.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.notifyOncePerLease('u1', 'l1', {
        type: 'message_new',
        title: 'x',
        body: 'y',
      }),
    ).resolves.toBeNull();
  });

  it('notifyOncePerLease глушит прочие ошибки БД', async () => {
    prisma.notification.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.notifyOncePerLease('u1', 'l1', {
        type: 'message_new',
        title: 'x',
        body: 'y',
      }),
    ).resolves.toBeNull();
  });

  it('после markLeaseRead следующее уведомление снова создаётся', async () => {
    let unread = false;
    prisma.notification.create.mockImplementation(async () => {
      if (unread) {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      unread = true;
      return { id: 'n1' };
    });
    prisma.notification.updateMany.mockImplementation(async () => {
      unread = false;
      return { count: 1 };
    });

    const input = { type: 'message_new', title: 'x', body: 'y' };
    await expect(service.notifyOncePerLease('u1', 'l1', input)).resolves.toBeTruthy();
    await expect(service.notifyOncePerLease('u1', 'l1', input)).resolves.toBeNull();
    await service.markLeaseRead('u1', 'l1', 'message_new');
    await expect(service.notifyOncePerLease('u1', 'l1', input)).resolves.toBeTruthy();
  });

  it('markLeaseRead фильтрует по пользователю, договору и типу', async () => {
    await service.markLeaseRead('u1', 'l1', 'message_new');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        leaseId: 'l1',
        readAt: null,
        type: 'message_new',
      },
      data: { readAt: expect.any(Date) },
    });
  });

  it('MarkLeaseReadDto отвергает тип вне allowlist', async () => {
    const dto = Object.assign(new MarkLeaseReadDto(), {
      leaseId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'billing_due',
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'type')).toBe(true);
  });
});
