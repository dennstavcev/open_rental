import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Message } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { MessagesService, MessageAttachment } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

@Controller()
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post('leases/:leaseId/messages')
  @UseInterceptors(
    FileInterceptor('attachment', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }),
  )
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Body() dto: SendMessageDto,
    @UploadedFile() attachment: MessageAttachment | undefined,
  ): Promise<Message> {
    return this.messages.send(user.id, leaseId, dto, attachment);
  }

  @Get('leases/:leaseId/messages')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<Message[]> {
    return this.messages.list(user.id, leaseId);
  }

  @Patch('messages/:id')
  edit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EditMessageDto,
  ): Promise<Message> {
    return this.messages.edit(user.id, id, dto.body);
  }

  @Get('messages/:id/attachment')
  async attachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const { buffer, mime, name } = await this.messages.downloadAttachment(
      user.id,
      id,
    );
    return new StreamableFile(buffer, { type: mime, disposition: `inline; filename="${name}"` });
  }

  // Удаление сообщения — только SuperAdmin (docs/ARCHITECTURE.md).
  @Delete('messages/:id')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.messages.deleteAsSuperAdmin(id);
  }
}
