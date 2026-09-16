import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Review } from './review.entity.js';
import { ServiceProvidersService } from '../service-providers/service-providers.service.js';
import type { CreateReviewDto } from './dto/create-review.dto.js';
import { NotFoundException } from '@nestjs/common';

describe('ReviewsService', () => {
  let service: ReviewsService;
  const repositoryMock = {
    create: vi.fn(),
    save: vi.fn(),
    find: vi.fn(),
    countBy: vi.fn(),
    average: vi.fn(),
  };
  const serviceProvidersServiceMock = {
    findOne: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(Review), useValue: repositoryMock },
        {
          provide: ServiceProvidersService,
          useValue: serviceProvidersServiceMock,
        },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create and save a review for an existing service provider', async () => {
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

      serviceProvidersServiceMock.findOne.mockResolvedValue({
        id: serviceProviderId,
      });
      repositoryMock.create.mockReturnValue(expectedReview);
      repositoryMock.save.mockResolvedValue(expectedReview);

      const result = await service.create(serviceProviderId, createReviewDto);

      expect(serviceProvidersServiceMock.findOne).toHaveBeenCalledWith(serviceProviderId);
      expect(repositoryMock.create).toHaveBeenCalledWith({
        ...createReviewDto,
        serviceProviderId,
      });
      expect(repositoryMock.save).toHaveBeenCalledWith(expectedReview);
      expect(result).toBe(expectedReview);
    });

    it('should not create a review when the service provider does not exist', async () => {
      const serviceProviderId = 999;
      const createReviewDto: CreateReviewDto = {
        authorName: 'Alice Martin',
        rating: 5,
        comment: 'Excellent service',
      };
      const error = new NotFoundException(
        `Service provider with id ${serviceProviderId} not found`,
      );

      serviceProvidersServiceMock.findOne.mockRejectedValue(error);

      await expect(service.create(serviceProviderId, createReviewDto)).rejects.toBe(error);

      expect(repositoryMock.create).not.toHaveBeenCalled();
      expect(repositoryMock.save).not.toHaveBeenCalled();
    });
  });

  describe('findAllForServiceProvider', () => {
    it('should return reviews for an existing service provider', async () => {
      const serviceProviderId = 1;
      const expectedReviews = [
        Object.assign(new Review(), {
          id: 1,
          authorName: 'Alice Martin',
          rating: 5,
          comment: 'Excellent service',
          createdAt: new Date(),
          serviceProviderId,
        }),
      ];

      serviceProvidersServiceMock.findOne.mockResolvedValue({
        id: serviceProviderId,
      });
      repositoryMock.find.mockResolvedValue(expectedReviews);

      const result = await service.findAllForServiceProvider(serviceProviderId);

      expect(serviceProvidersServiceMock.findOne).toHaveBeenCalledWith(serviceProviderId);
      expect(repositoryMock.find).toHaveBeenCalledWith({
        where: { serviceProviderId },
        order: { createdAt: 'DESC' },
      });
      expect(result).toBe(expectedReviews);
    });
  });

  describe('getSummaryForServiceProvider', () => {
    it('should return the review count and rounded average rating', async () => {
      const serviceProviderId = 1;

      serviceProvidersServiceMock.findOne.mockResolvedValue({
        id: serviceProviderId,
      });
      repositoryMock.countBy.mockResolvedValue(3);
      repositoryMock.average.mockResolvedValue(3.666666);

      const result = await service.getSummaryForServiceProvider(serviceProviderId);

      expect(serviceProvidersServiceMock.findOne).toHaveBeenCalledWith(serviceProviderId);
      expect(repositoryMock.countBy).toHaveBeenCalledWith({
        serviceProviderId,
      });
      expect(repositoryMock.average).toHaveBeenCalledWith('rating', {
        serviceProviderId,
      });
      expect(result).toEqual({
        reviewCount: 3,
        averageRating: 3.7,
      });
    });

    it('should return a null average rating when there are no reviews', async () => {
      const serviceProviderId = 1;

      serviceProvidersServiceMock.findOne.mockResolvedValue({
        id: serviceProviderId,
      });
      repositoryMock.countBy.mockResolvedValue(0);
      repositoryMock.average.mockResolvedValue(null);

      const result = await service.getSummaryForServiceProvider(serviceProviderId);

      expect(result).toEqual({
        reviewCount: 0,
        averageRating: null,
      });
    });
  });
});
