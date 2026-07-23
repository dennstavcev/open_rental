import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Lease, LeaseSignedScan } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import {
  LeaseSignedScansService,
  UploadedFile as UploadedFileData,
} from './lease-signed-scans.service';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 МБ

@Controller('leases/:leaseId/signed-scans')
@UseGuards(JwtAuthGuard)
export class LeaseSignedScansController {
  constructor(private readonly scans: LeaseSignedScansService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @UploadedFile() file: UploadedFileData | undefined,
  ): Promise<{ scan: LeaseSignedScan; lease: Lease; activated: boolean }> {
    if (!file) {
      throw new BadRequestException('Файл не приложен (поле "file")');
    }
    return this.scans.upload(user.id, leaseId, file);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<LeaseSignedScan[]> {
    return this.scans.list(user.id, leaseId);
  }

  @Get(':scanId/file')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Param('scanId') scanId: string,
  ): Promise<StreamableFile> {
    const { buffer, mimeType } = await this.scans.download(
      user.id,
      leaseId,
      scanId,
    );
    return new StreamableFile(buffer, { type: mimeType });
  }
}
