import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Message } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeasesService } from '../leases/leases.service';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '../storage/storage-provider.interface';
import { SendMessageDto } from './dto/send-message.dto';

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export interface MessageAttachment {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: LeasesService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async send(
    userId: string,
    leaseId: string,
    dto: SendMessageDto,
    attachment?: MessageAttachment,
  ): Promise<Message> {
    await this.leases.getForUser(userId, leaseId);

    let attachmentStorageKey: string | undefined;
    let attachmentMime: string | undefined;
    let attachmentName: string | undefined;
    if (attachment) {
      const ext = ALLOWED_MIME[attachment.mimetype];
      if (!ext) {
        throw new BadRequestException('Вложение должно быть JPEG, PNG или PDF');
      }
      attachmentStorageKey = `messages/${leaseId}/${randomUUID()}.${ext}`;
      await this.storage.put(
        attachmentStorageKey,
        attachment.buffer,
        attachment.mimetype,
      );
      attachmentMime = attachment.mimetype;
      attachmentName = attachment.originalname;
    }

    return this.prisma.message.create({
      data: {
        leaseId,
        senderId: userId,
        body: dto.body,
        isOfficial: dto.isOfficial ?? false,
        attachmentStorageKey,
        attachmentMime,
        attachmentName,
      },
    });
  }

  async list(userId: string, leaseId: string): Promise<Message[]> {
    await this.leases.getForUser(userId, leaseId);
    return this.prisma.message.findMany({
      where: { leaseId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async edit(userId: string, messageId: string, body: string): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) {
      throw new NotFoundException('Сообщение не найдено');
    }
    if (message.senderId !== userId) {
      throw new ForbiddenException('Редактировать может только автор');
    }
    return this.prisma.message.update({
      where: { id: messageId },
      data: { body, editedAt: new Date() },
    });
  }

  async downloadAttachment(
    userId: string,
    messageId: string,
  ): Promise<{ buffer: Buffer; mime: string; name: string }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message || !message.attachmentStorageKey) {
      throw new NotFoundException('Вложение не найдено');
    }
    await this.leases.getForUser(userId, message.leaseId); // доступ стороны
    return {
      buffer: await this.storage.get(message.attachmentStorageKey),
      mime: message.attachmentMime ?? 'application/octet-stream',
      name: message.attachmentName ?? 'attachment',
    };
  }

  // Удаление — только SuperAdmin (проверяется гардом на контроллере).
  async deleteAsSuperAdmin(messageId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) {
      throw new NotFoundException('Сообщение не найдено');
    }
    if (message.attachmentStorageKey) {
      await this.storage.delete(message.attachmentStorageKey);
    }
    await this.prisma.message.delete({ where: { id: messageId } });
  }
}
