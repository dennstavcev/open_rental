import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from '../leases/leases.service';
import { StorageProvider } from '../storage/storage-provider.interface';
import { NotificationsService } from '../notifications/notifications.service';

const lease = { id: 'l1', landlordId: 'landlord1', tenantId: 'tenant1' };

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: any;
  let leases: { getForUser: jest.Mock };
  let storage: jest.Mocked<StorageProvider>;
  let notifications: { notifyOncePerLease: jest.Mock };

  beforeEach(() => {
    prisma = {
      message: {
        create: jest.fn().mockResolvedValue({ id: 'm1' }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'm1', ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    leases = { getForUser: jest.fn().mockResolvedValue(lease) };
    storage = { put: jest.fn(), get: jest.fn(), delete: jest.fn(), getUrl: jest.fn() };
    notifications = { notifyOncePerLease: jest.fn().mockResolvedValue({}) };
    service = new MessagesService(
      prisma as unknown as PrismaService,
      leases as unknown as LeasesService,
      notifications as unknown as NotificationsService,
      storage,
    );
  });

  it('send проверяет доступ к договору и сохраняет автора', async () => {
    await service.send('tenant1', 'l1', { body: 'привет' });
    expect(leases.getForUser).toHaveBeenCalledWith('tenant1', 'l1');
    expect(prisma.message.create.mock.calls[0][0].data.senderId).toBe('tenant1');
  });

  it('send уведомляет контрагента, но не автора', async () => {
    await service.send('tenant1', 'l1', { body: 'привет' });
    expect(notifications.notifyOncePerLease).toHaveBeenCalledTimes(1);
    expect(notifications.notifyOncePerLease).toHaveBeenCalledWith(
      'landlord1',
      'l1',
      expect.objectContaining({ type: 'message_new' }),
    );
    expect(notifications.notifyOncePerLease).not.toHaveBeenCalledWith(
      'tenant1',
      expect.anything(),
      expect.anything(),
    );
  });

  it('send возвращает сообщение, когда уведомление завершилось best-effort ошибкой', async () => {
    notifications.notifyOncePerLease.mockResolvedValue(null);
    await expect(
      service.send('tenant1', 'l1', { body: 'привет' }),
    ).resolves.toEqual({ id: 'm1' });
  });

  it('list недоступен постороннему (getForUser бросает)', async () => {
    leases.getForUser.mockRejectedValue(new NotFoundException());
    await expect(service.list('stranger', 'l1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('редактировать может только автор', async () => {
    prisma.message.findUnique.mockResolvedValue({ id: 'm1', senderId: 'tenant1' });
    await expect(
      service.edit('landlord1', 'm1', 'правка'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('автор редактирует — проставляется editedAt', async () => {
    prisma.message.findUnique.mockResolvedValue({ id: 'm1', senderId: 'tenant1' });
    const res = await service.edit('tenant1', 'm1', 'правка');
    expect(res.body).toBe('правка');
    expect(res.editedAt).toBeInstanceOf(Date);
  });

  it('вложение сохраняется в хранилище и в полях сообщения', async () => {
    await service.send('tenant1', 'l1', { body: 'смотри' }, {
      buffer: Buffer.from('img'),
      mimetype: 'image/png',
      originalname: 'foto.png',
    });
    expect(storage.put).toHaveBeenCalled();
    const data = prisma.message.create.mock.calls[0][0].data;
    expect(data.attachmentMime).toBe('image/png');
    expect(data.attachmentName).toBe('foto.png');
  });

  it('SuperAdmin-удаление удаляет файл вложения и запись', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'm1',
      attachmentStorageKey: 'messages/l1/x.png',
    });
    await service.deleteAsSuperAdmin('m1');
    expect(storage.delete).toHaveBeenCalledWith('messages/l1/x.png');
    expect(prisma.message.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
  });
});
