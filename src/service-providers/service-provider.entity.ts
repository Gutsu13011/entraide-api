import { Entity, PrimaryGeneratedColumn, Column, Index, OneToMany, type Relation } from 'typeorm';
import { Review } from '../reviews/review.entity.js';

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

  @OneToMany(() => Review, (review) => review.serviceProvider)
  reviews: Relation<Review[]>;
}
