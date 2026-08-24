import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingService } from './billing.service';

// Планировщик расчётных периодов (ADR-0013): периодический идемпотентный
// скан. BullMQ/Redis отложены — операция runPeriodTransition идемпотентна
// по конструкции, повторный запуск безопасен.
@Injectable()
export class BillingScheduler {
  private readonly logger = new Logger(BillingScheduler.name);

  constructor(private readonly billing: BillingService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handlePeriodTransition(): Promise<void> {
    const { finalized, skipped } = await this.billing.runPeriodTransition();
    if (finalized || skipped) {
      this.logger.log(
        `Переход периодов: финализировано ${finalized}, пропущено (нет показаний) ${skipped}`,
      );
    }
  }

  // Ежедневно: напоминания за 3 и за 1 день до срока подачи показаний.
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleReadingReminders(): Promise<void> {
    const { reminded, overdueNotified } =
      await this.billing.runReadingReminders();
    if (reminded || overdueNotified) {
      this.logger.log(
        `Напоминаний о показаниях отправлено: ${reminded}, уведомлений о просрочке: ${overdueNotified}`,
      );
    }
  }
}
