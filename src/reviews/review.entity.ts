import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  JoinColumn,
  ManyToOne,
  type Relation,
  Index,
  OneToOne,
} from 'typeorm';
import { ServiceProvider } from '../service-providers/service-provider.entity.js';
import { ServiceRequest } from '../service-requests/service-request.entity.js';

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  authorName: string;

  @Column('integer')
  rating: number;

  @Column('text')
  comment: string;

  @CreateDateColumn()
  createdAt: Date;

  @Index('IDX_reviews_service_provider_id')
  @Column()
  serviceProviderId: number;
  @ManyToOne(() => ServiceProvider, (serviceProvider) => serviceProvider.reviews, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'serviceProviderId',
    foreignKeyConstraintName: 'FK_reviews_service_provider',
  })
  serviceProvider: Relation<ServiceProvider>;

  @Column('integer', { nullable: true })
  serviceRequestId: number | null;

  @OneToOne(() => ServiceRequest, (serviceRequest) => serviceRequest.review, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'serviceRequestId', foreignKeyConstraintName: 'FK_reviews_service_request' })
  serviceRequest: Relation<ServiceRequest> | null;
}
