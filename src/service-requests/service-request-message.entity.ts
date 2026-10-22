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
import { ServiceRequest } from './service-request.entity.js';
import { User } from '../users/user.entity.js';

@Entity('service_request_messages')
@Index('IDX_service_request_messages_request_created_at_id', [
  'serviceRequestId',
  'createdAt',
  'id',
])
export class ServiceRequestMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column('datetime', { nullable: true })
  readAt: Date | null;

  @Column('integer')
  serviceRequestId: number;

  @Index('IDX_service_request_messages_author_user_id')
  @Column('integer')
  authorUserId: number;

  @ManyToOne(() => ServiceRequest, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'serviceRequestId',
    foreignKeyConstraintName: 'FK_service_request_messages_request',
  })
  serviceRequest: Relation<ServiceRequest>;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'authorUserId',
    foreignKeyConstraintName: 'FK_service_request_messages_author',
  })
  authorUser: Relation<User>;
}
