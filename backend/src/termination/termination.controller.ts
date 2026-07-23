import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TerminationRequest } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { TerminationService } from './termination.service';
import { CreateTerminationDto } from './dto/create-termination.dto';
import { FinalizeTerminationDto } from './dto/finalize-termination.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class TerminationController {
  constructor(private readonly termination: TerminationService) {}

  @Post('leases/:leaseId/termination-requests')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Body() dto: CreateTerminationDto,
  ): Promise<TerminationRequest> {
    return this.termination.create(user.id, leaseId, dto);
  }

  @Get('leases/:leaseId/termination-requests')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ): Promise<TerminationRequest[]> {
    return this.termination.list(user.id, leaseId);
  }

  @Post('termination-requests/:id/finalize')
  @HttpCode(HttpStatus.OK)
  finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FinalizeTerminationDto,
  ): Promise<TerminationRequest> {
    return this.termination.finalize(user.id, id, dto);
  }
}
