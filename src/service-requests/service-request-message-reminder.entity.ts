import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { ServiceRequestMessageReminderStatus } from './service-request-message-reminder-status.enum.js';
import { ServiceRequest } from './service-request.entity.js';
import { User } from '../users/user.entity.js';

@Entity('service_request_message_reminders')
@Index('IDX_service_request_message_reminders_status_due_at', ['status', 'dueAt'])
@Index('IDX_service_request_message_reminders_pending', ['serviceRequestId', 'recipientUserId'], {
  unique: true,
  where: `"status" = 'PENDING'`,
})
export class ServiceRequestMessageReminder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { default: ServiceRequestMessageReminderStatus.PENDING })
  status: ServiceRequestMessageReminderStatus;

  @Column('datetime')
  dueAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @Column('datetime', { nullable: true })
  sentAt: Date | null;

  @Column('integer')
  serviceRequestId: number;

  @Column('integer')
  recipientUserId: number;

  @ManyToOne(() => ServiceRequest, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'serviceRequestId',
    foreignKeyConstraintName: 'FK_service_request_message_reminders_request',
  })
  serviceRequest: Relation<ServiceRequest>;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'recipientUserId',
    foreignKeyConstraintName: 'FK_service_request_message_reminders_recipient',
  })
  recipientUser: Relation<User>;
}
