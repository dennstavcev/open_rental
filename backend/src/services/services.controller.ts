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
import { Service } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Controller('properties/:propertyId/services')
@UseGuards(JwtAuthGuard)
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
    @Body() dto: CreateServiceDto,
  ): Promise<Service> {
    return this.services.create(user.id, propertyId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
  ): Promise<Service[]> {
    return this.services.findAll(user.id, propertyId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ): Promise<Service> {
    return this.services.update(user.id, propertyId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.services.remove(user.id, propertyId, id);
  }
}
