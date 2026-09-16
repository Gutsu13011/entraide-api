import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';
import { Review } from './review.entity.js';
import type { CreateReviewDto } from './dto/create-review.dto.js';
import type { ReviewSummaryDto } from './dto/review-summary.dto.js';

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
    }).compile();

    controller = module.get<ReviewsController>(ReviewsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return reviews for a service provider', async () => {
      const serviceProviderId = 1;
      const expectedReviews: Review[] = [];

      reviewsServiceMock.findAllForServiceProvider.mockResolvedValue(expectedReviews);

      const result = await controller.findAll(serviceProviderId);

      expect(reviewsServiceMock.findAllForServiceProvider).toHaveBeenCalledWith(serviceProviderId);
      expect(result).toBe(expectedReviews);
    });
  });

  describe('create', () => {
    it('should create a review for a service provider', async () => {
      const serviceProviderId = 1;
      const createReviewDto: CreateReviewDto = {
        authorName: 'Alice Martin',
        rating: 5,
        comment: 'Excellent service',
      };
      const expectedReview = Object.assign(new Review(), {
        id: 1,
        ...createReviewDto,
        serviceProviderId,
        createdAt: new Date(),
      });

      reviewsServiceMock.create.mockResolvedValue(expectedReview);

      const result = await controller.create(serviceProviderId, createReviewDto);

      expect(reviewsServiceMock.create).toHaveBeenCalledWith(serviceProviderId, createReviewDto);
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
