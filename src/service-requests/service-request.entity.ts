import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
  Check,
} from 'typeorm';
import { ServiceRequestStatus } from './service-request-status.enum.js';
import type { ServicePricingType } from '../service-offerings/service-pricing-type.enum.js';
import { User } from '../users/user.entity.js';
import { ServiceOffering } from '../service-offerings/service-offering.entity.js';

@Entity('service_requests')
@Check(
  'CHK_service_requests_snapshot_pricing',
  `("offeringPricingTypeSnapshot" = 'FREE'
      AND "offeringHourlyRateSnapshot" IS NULL)
    OR
    ("offeringPricingTypeSnapshot" = 'HOURLY'
      AND "offeringHourlyRateSnapshot" IS NOT NULL
      AND "offeringHourlyRateSnapshot" > 0)`,
)
export class ServiceRequest {
  @PrimaryGeneratedColumn()
  id: number;
  @Column('text')
  message: string;
  @Column('varchar', { default: ServiceRequestStatus.SENT })
  status: ServiceRequestStatus;
  @CreateDateColumn()
  createdAt: Date;
  @Column()
  offeringTitleSnapshot: string;
  @Column('varchar')
  offeringPricingTypeSnapshot: ServicePricingType;
  @Column('real', { nullable: true })
  offeringHourlyRateSnapshot: number | null;
  @Index('IDX_service_requests_requester_user_id')
  @Column('integer')
  requesterUserId: number;
  @Index('IDX_service_requests_recipient_user_id')
  @Column('integer')
  recipientUserId: number;
  @Index('IDX_service_requests_service_offering_id')
  @Column('integer', { nullable: true })
  serviceOfferingId: number | null;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'requesterUserId',
    foreignKeyConstraintName: 'FK_service_requests_requester_user',
  })
  requesterUser: Relation<User>;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'recipientUserId',
    foreignKeyConstraintName: 'FK_service_requests_recipient_user',
  })
  recipientUser: Relation<User>;

  @ManyToOne(() => ServiceOffering, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'serviceOfferingId',
    foreignKeyConstraintName: 'FK_service_requests_service_offering',
  })
  serviceOffering: Relation<ServiceOffering> | null;
}
