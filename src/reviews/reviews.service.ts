import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { Review } from './review.entity.js';
import { ServiceProvidersService } from '../service-providers/service-providers.service.js';
import type { CreateReviewDto } from './dto/create-review.dto.js';
import type { ReviewSummaryDto } from './dto/review-summary.dto.js';
import { ServiceRequest } from '../service-requests/service-request.entity.js';
import { ServiceRequestStatus } from '../service-requests/service-request-status.enum.js';
import { ReviewResponseDto } from './dto/review-response.dto.js';
@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewsRepository: Repository<Review>,
    private readonly serviceProvidersService: ServiceProvidersService,
    @InjectRepository(ServiceRequest)
    private readonly serviceRequestsRepository: Repository<ServiceRequest>,
  ) {}

  async create(
    serviceProviderId: number,
    createReviewDto: CreateReviewDto,
    userId: number,
  ): Promise<ReviewResponseDto> {
    await this.serviceProvidersService.findOne(serviceProviderId);

    const serviceRequest = await this.serviceRequestsRepository.findOne({
      where: { id: createReviewDto.serviceRequestId, serviceProviderId },
      relations: {
        requesterUser: true,
      },
    });

    if (serviceRequest === null) {
      throw new NotFoundException('Service request not found for this service provider');
    }

    if (serviceRequest.requesterUserId !== userId) {
      throw new ForbiddenException('Only the requester can review this service');
    }

    if (serviceRequest.status !== ServiceRequestStatus.COMPLETED) {
      throw new ConflictException('Only completed service requests can be reviewed');
    }

    const alreadyReviewed = await this.reviewsRepository.existsBy({
      serviceRequestId: serviceRequest.id,
    });

    if (alreadyReviewed) {
      throw new ConflictException('This service request has already been reviewed');
    }

    const review = this.reviewsRepository.create({
      serviceProviderId,
      serviceRequestId: serviceRequest.id,
      authorName: `${serviceRequest.requesterUser.firstName} ${serviceRequest.requesterUser.lastName}`,
      rating: createReviewDto.rating,
      comment: createReviewDto.comment,
    });
    try {
      const savedReview = await this.reviewsRepository.save(review);

      return this.toResponse(savedReview);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        error.driverError.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
        error.driverError.message === 'UNIQUE constraint failed: reviews.serviceRequestId'
      ) {
        throw new ConflictException('This service request has already been reviewed');
      }
      throw error;
    }
  }

  async findAllForServiceProvider(serviceProviderId: number): Promise<ReviewResponseDto[]> {
    await this.serviceProvidersService.findOne(serviceProviderId);

    const reviewsFound = await this.reviewsRepository.find({
      where: { serviceProviderId },
      order: { createdAt: 'DESC' },
    });

    return reviewsFound.map((review) => this.toResponse(review));
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

  private toResponse(review: Review): ReviewResponseDto {
    return {
      id: review.id,
      authorName: review.authorName,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      serviceProviderId: review.serviceProviderId,
    };
  }
}
