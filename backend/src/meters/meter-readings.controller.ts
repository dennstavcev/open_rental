import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MeterReading } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import {
  MeterReadingsService,
  ReadingPhoto,
  ReadingResult,
} from './meter-readings.service';
import { CreateReadingDto } from './dto/create-reading.dto';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

@Controller('meters/:meterId/readings')
@UseGuards(JwtAuthGuard)
export class MeterReadingsController {
  constructor(private readonly readings: MeterReadingsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('photo', { limits: { fileSize: MAX_PHOTO_BYTES } }),
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('meterId') meterId: string,
    @Body() dto: CreateReadingDto,
    @UploadedFile() photo: ReadingPhoto | undefined,
  ): Promise<ReadingResult> {
    if (!photo) {
      throw new BadRequestException('Фото показания обязательно (поле "photo")');
    }
    return this.readings.create(
      user.id,
      meterId,
      dto.confirmedValue,
      photo,
      dto.readingDate,
    );
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('meterId') meterId: string,
  ): Promise<MeterReading[]> {
    return this.readings.listForMeter(user.id, meterId);
  }
}
