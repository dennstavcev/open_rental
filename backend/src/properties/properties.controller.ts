import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Property } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import {
  PropertiesService,
  PropertyLeaseHistoryEntry,
} from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';

@Controller('properties')
@UseGuards(JwtAuthGuard)
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePropertyDto,
  ): Promise<Property> {
    return this.properties.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<Property[]> {
    return this.properties.findAllForOwner(user.id);
  }

  @Get(':id/lease-history')
  leaseHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<PropertyLeaseHistoryEntry[]> {
    return this.properties.getLeaseHistory(user.id, id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Property> {
    return this.properties.findOneForOwner(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePropertyDto,
  ): Promise<Property> {
    return this.properties.update(user.id, id, dto);
  }
}
