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
  UseGuards,
} from '@nestjs/common';
import { LeaseInventoryItem } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { LeaseInventoryItemsService } from './lease-inventory-items.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { UpdateInventoryReturnDto } from './dto/update-inventory-return.dto';

@Controller('leases/:leaseId/inventory-items')
@UseGuards(JwtAuthGuard)
export class LeaseInventoryItemsController {
  constructor(private readonly items: LeaseInventoryItemsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Body() dto: CreateInventoryItemDto,
  ): Promise<LeaseInventoryItem> {
    return this.items.create(user.id, leaseId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<LeaseInventoryItem[]> {
    return this.items.findAll(user.id, leaseId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
  ): Promise<LeaseInventoryItem> {
    return this.items.update(user.id, leaseId, id, dto);
  }

  @Patch(':id/return-state')
  updateReturnState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryReturnDto,
  ): Promise<LeaseInventoryItem> {
    return this.items.updateReturnState(user.id, leaseId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.items.remove(user.id, leaseId, id);
  }
}
