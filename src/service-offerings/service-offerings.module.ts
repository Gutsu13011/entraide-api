import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceOffering } from './service-offering.entity.js';
import { ServiceOfferingService } from './service-offering.service.js';
import { ServiceProvidersModule } from '../service-providers/service-providers.module.js';
import { ServiceOfferingsController } from './service-offerings.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceOffering]), ServiceProvidersModule],
  providers: [ServiceOfferingService],
  controllers: [ServiceOfferingsController],
})
export class ServiceOfferingsModule {}
