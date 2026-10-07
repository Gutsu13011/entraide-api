import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  OneToMany,
  type Relation,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Review } from '../reviews/review.entity.js';
import { ServiceOffering } from '../service-offerings/service-offering.entity.js';
import { User } from '../users/user.entity.js';

@Entity('service_providers')
export class ServiceProvider {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  firstName: string;
  @Column()
  lastName: string;
  @Column()
  profession: string;
  @Index('IDX_service_providers_city')
  @Column()
  city: string;
  @Column('text')
  description: string;
  @Column('real')
  hourlyRate: number;
  @Column()
  available: boolean;
  @Column()
  imageUrl: string;
  @Column('integer', { nullable: true })
  ownerUserId: number | null;

  @OneToMany(() => Review, (review) => review.serviceProvider)
  reviews?: Relation<Review[]>;
  @OneToMany(() => ServiceOffering, (serviceOffering) => serviceOffering.serviceProvider)
  serviceOfferings?: Relation<ServiceOffering[]>;
  @OneToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ownerUserId', foreignKeyConstraintName: 'FK_service_providers_owner_user' })
  ownerUser?: Relation<User | null>;
}
