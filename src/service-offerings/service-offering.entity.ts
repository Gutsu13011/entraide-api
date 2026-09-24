import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { ServiceProvider } from '../service-providers/service-provider.entity.js';
import { ServicePricingType } from './service-pricing-type.enum.js';

@Entity('service_offerings')
@Check(
  'CHK_service_offerings_pricing',
  `("pricingType" = 'FREE' AND "hourlyRate" IS NULL)
    OR ("pricingType" = 'HOURLY' AND "hourlyRate" IS NOT NULL AND "hourlyRate" > 0)`,
)
export class ServiceOffering {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column('text')
  description: string;

  @Column('varchar')
  pricingType: ServicePricingType;

  @Column('real', { nullable: true })
  hourlyRate: number | null;

  @Index('IDX_service_offerings_service_provider_id')
  @Column()
  serviceProviderId: number;

  @ManyToOne(() => ServiceProvider, (serviceProvider) => serviceProvider.serviceOfferings, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'serviceProviderId',
    foreignKeyConstraintName: 'FK_service_offerings_service_provider',
  })
  serviceProvider: Relation<ServiceProvider>;
}
