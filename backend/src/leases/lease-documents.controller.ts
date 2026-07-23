import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LeaseDocument } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { LeaseDocumentsService } from './lease-documents.service';

@Controller('leases/:leaseId/document')
@UseGuards(JwtAuthGuard)
export class LeaseDocumentsController {
  constructor(private readonly documents: LeaseDocumentsService) {}

  @Post()
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<LeaseDocument> {
    return this.documents.generate(user.id, leaseId);
  }

  @Get()
  getLatest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<LeaseDocument> {
    return this.documents.getLatest(user.id, leaseId);
  }

  // Print-ready HTML последней версии.
  @Get('html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async html(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<string> {
    const doc = await this.documents.getLatest(user.id, leaseId);
    return doc.content;
  }
}
