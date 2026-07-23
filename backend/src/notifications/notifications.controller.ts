import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Notification } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Notification[]> {
    return this.notifications.list(user.id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Notification> {
    return this.notifications.markRead(user.id, id);
  }
}
