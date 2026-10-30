import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';
import type { ReviewResponseDto } from './dto/review-response.dto.js';
import type { CreateReviewDto } from './dto/create-review.dto.js';
import type { ReviewSummaryDto } from './dto/review-summary.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { Request } from 'express';

describe('ReviewsController', () => {
  let controller: ReviewsController;
  const reviewsServiceMock = {
    create: vi.fn(),
    findAllForServiceProvider: vi.fn(),
    getSummaryForServiceProvider: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [{ provide: ReviewsService, useValue: reviewsServiceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReviewsController>(ReviewsController);
  });

  describe('findAll', () => {
    it('should return reviews for a service provider', async () => {
      const serviceProviderId = 1;
      const expectedReviews: ReviewResponseDto[] = [];

      reviewsServiceMock.findAllForServiceProvider.mockResolvedValue(expectedReviews);

      const result = await controller.findAll(serviceProviderId);

      expect(reviewsServiceMock.findAllForServiceProvider).toHaveBeenCalledWith(serviceProviderId);
      expect(result).toBe(expectedReviews);
    });
  });

  describe('create', () => {
    it('should pass the review body and authenticated user id to the service', async () => {
      const serviceProviderId = 1;
      const createReviewDto: CreateReviewDto = {
        serviceRequestId: 41,
        rating: 5,
        comment: 'Excellent service',
      };
      const expectedReview: ReviewResponseDto = {
        id: 1,
        rating: createReviewDto.rating,
        comment: createReviewDto.comment,
        authorName: 'Alice Martin',
        serviceProviderId,
        createdAt: new Date(),
      };

      reviewsServiceMock.create.mockResolvedValue(expectedReview);

      const userId = 7;
      const request = { user: { id: userId } } as Request & { user: { id: number } };
      const result = await controller.create(serviceProviderId, createReviewDto, request);

      expect(reviewsServiceMock.create).toHaveBeenCalledExactlyOnceWith(
        serviceProviderId,
        createReviewDto,
        userId,
      );
      expect(result).toBe(expectedReview);
    });
  });

  describe('getSummary', () => {
    it('should return the review summary for a service provider', async () => {
      const serviceProviderId = 1;
      const expectedSummary: ReviewSummaryDto = {
        reviewCount: 3,
        averageRating: 3.7,
      };

      reviewsServiceMock.getSummaryForServiceProvider.mockResolvedValue(expectedSummary);

      const result = await controller.getSummary(serviceProviderId);

      expect(reviewsServiceMock.getSummaryForServiceProvider).toHaveBeenCalledWith(
        serviceProviderId,
      );
      expect(result).toBe(expectedSummary);
    });
  });
});
