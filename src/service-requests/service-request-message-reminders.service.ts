import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ServiceRequestMessageReminder } from './service-request-message-reminder.entity.js';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ServiceRequestMessageReminderStatus } from './service-request-message-reminder-status.enum.js';

@Injectable()
export class ServiceRequestMessageRemindersService {
  constructor(
    @InjectRepository(ServiceRequestMessageReminder)
    private readonly serviceRequestMessageReminder: Repository<ServiceRequestMessageReminder>,
  ) {}
  async findDueReminders(now: Date = new Date()): Promise<ServiceRequestMessageReminder[]> {
    return this.serviceRequestMessageReminder.find({
      where: {
        status: ServiceRequestMessageReminderStatus.PENDING,
        dueAt: LessThanOrEqual(now),
      },
      order: { dueAt: 'ASC', id: 'ASC' },
      take: 50,
    });
  }
}
