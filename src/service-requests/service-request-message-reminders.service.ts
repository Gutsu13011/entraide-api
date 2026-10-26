import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ServiceRequestMessageReminder } from './service-request-message-reminder.entity.js';
import { IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';
import { ServiceRequestMessageReminderStatus } from './service-request-message-reminder-status.enum.js';
import { ServiceRequestMessage } from './service-request-message.entity.js';
import type { ServiceRequestMessageReminderEmail } from './service-request-message-reminder-email.js';
import { MailService } from '../mail/mail.service.js';
@Injectable()
export class ServiceRequestMessageRemindersService {
  private readonly sendingReminderIds = new Set<number>();

  constructor(
    @InjectRepository(ServiceRequestMessageReminder)
    private readonly serviceRequestMessageReminderRepository: Repository<ServiceRequestMessageReminder>,
    private readonly mailService: MailService,
  ) {}
  async findDueReminders(now: Date = new Date()): Promise<ServiceRequestMessageReminder[]> {
    return this.serviceRequestMessageReminderRepository.find({
      where: {
        status: ServiceRequestMessageReminderStatus.PENDING,
        dueAt: LessThanOrEqual(now),
      },
      order: { dueAt: 'ASC', id: 'ASC' },
      take: 50,
    });
  }

  async prepareReminder(
    reminderId: number,
    now: Date = new Date(),
  ): Promise<ServiceRequestMessageReminder | null> {
    return this.serviceRequestMessageReminderRepository.manager.transaction(async (manager) => {
      const remindersRepository = manager.getRepository(ServiceRequestMessageReminder);
      const reminder = await remindersRepository.findOneBy({
        id: reminderId,
        status: ServiceRequestMessageReminderStatus.PENDING,
        dueAt: LessThanOrEqual(now),
      });

      if (reminder === null) {
        return null;
      }

      const oldestUnreadMessage = await manager.getRepository(ServiceRequestMessage).findOne({
        where: {
          serviceRequestId: reminder.serviceRequestId,
          authorUserId: Not(reminder.recipientUserId),
          readAt: IsNull(),
        },
        order: { createdAt: 'ASC', id: 'ASC' },
      });

      if (oldestUnreadMessage === null) {
        await remindersRepository.update(
          {
            id: reminderId,
            status: ServiceRequestMessageReminderStatus.PENDING,
          },
          { status: ServiceRequestMessageReminderStatus.CANCELLED },
        );

        return null;
      }

      const eligibleAt = new Date(oldestUnreadMessage.createdAt.getTime() + 5 * 60 * 1000);

      if (eligibleAt.getTime() > now.getTime()) {
        await remindersRepository.update(
          {
            id: reminderId,
            status: ServiceRequestMessageReminderStatus.PENDING,
          },
          { dueAt: eligibleAt },
        );

        return null;
      }

      return remindersRepository.findOneOrFail({
        where: { id: reminder.id },
        relations: { recipientUser: true, serviceRequest: true },
      });
    });
  }

  async prepareReminderEmail(
    reminderId: number,
    now: Date = new Date(),
  ): Promise<ServiceRequestMessageReminderEmail | null> {
    const reminder = await this.prepareReminder(reminderId, now);

    if (reminder === null) {
      return null;
    }

    const text = [
      `Bonjour ${reminder.recipientUser.firstName},`,
      '',
      `Des messages non lus vous attendent concernant « ${reminder.serviceRequest.offeringTitleSnapshot} ».`,
      '',
      'Connectez-vous à Entraide pour consulter votre discussion.',
      '',
      'L’équipe Entraide',
    ].join('\n');

    return {
      to: reminder.recipientUser.email,
      subject: 'Entraide : des messages vous attendent',
      text,
    };
  }

  async sendReminder(reminderId: number, now: Date = new Date()): Promise<boolean> {
    if (this.sendingReminderIds.has(reminderId)) {
      return false;
    }

    this.sendingReminderIds.add(reminderId);

    try {
      const email = await this.prepareReminderEmail(reminderId, now);

      if (email === null) {
        return false;
      }

      await this.mailService.sendText(email.to, email.subject, email.text);

      const result = await this.serviceRequestMessageReminderRepository.update(
        {
          id: reminderId,
        },
        {
          status: ServiceRequestMessageReminderStatus.SENT,
          sentAt: new Date(),
        },
      );

      if (result.affected !== 1) {
        throw new Error('Sent reminder could not be recorded');
      }

      return true;
    } finally {
      this.sendingReminderIds.delete(reminderId);
    }
  }
}
