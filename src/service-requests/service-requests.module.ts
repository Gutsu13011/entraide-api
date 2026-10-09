import { Module } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service.js';
import { ServiceRequestsController } from './service-requests.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceRequest } from './service-request.entity.js';
import { ServiceOffering } from '../service-offerings/service-offering.entity.js';
import { ServiceProvidersModule } from '../service-providers/service-providers.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  providers: [ServiceRequestsService],
  controllers: [ServiceRequestsController],
  imports: [
    TypeOrmModule.forFeature([ServiceRequest, ServiceOffering]),
    ServiceProvidersModule,
    AuthModule,
  ],
})
export class ServiceRequestsModule {}
