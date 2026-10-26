import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ServiceRequestMessageRemindersService } from './service-request-message-reminders.service.js';

@Injectable()
export class ServiceRequestMessageRemindersJob {
  private readonly logger = new Logger(ServiceRequestMessageRemindersJob.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly remindersService: ServiceRequestMessageRemindersService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'service-request-message-reminders',
    waitForCompletion: true,
  })
  async handleCron(): Promise<void> {
    if (!this.configService.getOrThrow<boolean>('MESSAGE_REMINDERS_ENABLED')) {
      return;
    }

    const reminders = await this.remindersService.findDueReminders();

    for (const reminder of reminders) {
      try {
        await this.remindersService.sendReminder(reminder.id);
      } catch (error) {
        this.logger.error(
          `Failed to send message reminder ${reminder.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
