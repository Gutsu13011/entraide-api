import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  JoinColumn,
  ManyToOne,
  type Relation,
  Index,
} from 'typeorm';
import { ServiceProvider } from '../service-providers/service-provider.entity.js';

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
}
