import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PartyInfoService } from './party-info.service';

// Планировщик ретеншена ПДн (ADR-0021) — по образцу BillingScheduler
// (ADR-0013): тонкая обёртка, вся логика — в PartyInfoService.runRetention.
@Injectable()
export class PartyInfoScheduler {
  private readonly logger = new Logger(PartyInfoScheduler.name);

  constructor(private readonly partyInfo: PartyInfoService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleRetention(): Promise<void> {
    const { deleted } = await this.partyInfo.runRetention();
    if (deleted) {
      this.logger.log(`Ретеншен ПДн: удалено записей — ${deleted}`);
    }
  }
}
