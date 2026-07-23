import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { LandlordSummary, ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // Сводка по всем договорам, где текущий пользователь — собственник.
  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser): Promise<LandlordSummary> {
    return this.reports.getLandlordSummary(user.id);
  }
}
