import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './review.entity.js';
import { ReviewsService } from './reviews.service.js';
import { ServiceProvidersModule } from '../service-providers/service-providers.module.js';
import { ReviewsController } from './reviews.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { ServiceRequest } from '../service-requests/service-request.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Review, ServiceRequest]), ServiceProvidersModule, AuthModule],
  providers: [ReviewsService],
  controllers: [ReviewsController],
})
export class ReviewsModule {}
