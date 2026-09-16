import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Review } from './review.entity.js';
import { ServiceProvidersService } from '../service-providers/service-providers.service.js';
import type { CreateReviewDto } from './dto/create-review.dto.js';
import type { ReviewSummaryDto } from './dto/review-summary.dto.js';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewsRepository: Repository<Review>,
    private readonly serviceProvidersService: ServiceProvidersService,
  ) {}

  async create(serviceProviderId: number, createReviewDto: CreateReviewDto): Promise<Review> {
    await this.serviceProvidersService.findOne(serviceProviderId);

    const review = this.reviewsRepository.create({ ...createReviewDto, serviceProviderId });

    return this.reviewsRepository.save(review);
  }

  async findAllForServiceProvider(serviceProviderId: number): Promise<Review[]> {
    await this.serviceProvidersService.findOne(serviceProviderId);

    return this.reviewsRepository.find({
      where: { serviceProviderId },
      order: { createdAt: 'DESC' },
    });
  }

  async getSummaryForServiceProvider(serviceProviderId: number): Promise<ReviewSummaryDto> {
    await this.serviceProvidersService.findOne(serviceProviderId);

    const [reviewCount, averageRating] = await Promise.all([
      this.reviewsRepository.countBy({ serviceProviderId }),
      this.reviewsRepository.average('rating', { serviceProviderId }),
    ]);

    return {
      reviewCount,
      averageRating: averageRating === null ? null : Math.round(averageRating * 10) / 10,
    };
  }
}
