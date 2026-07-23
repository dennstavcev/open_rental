import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Meter } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { MetersService } from './meters.service';
import { CreateMeterDto } from './dto/create-meter.dto';
import { UpdateMeterDto } from './dto/update-meter.dto';

@Controller('properties/:propertyId/meters')
@UseGuards(JwtAuthGuard)
export class MetersController {
  constructor(private readonly meters: MetersService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
    @Body() dto: CreateMeterDto,
  ): Promise<Meter> {
    return this.meters.create(user.id, propertyId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
  ): Promise<Meter[]> {
    return this.meters.findAll(user.id, propertyId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMeterDto,
  ): Promise<Meter> {
    return this.meters.update(user.id, propertyId, id, dto);
  }
}
