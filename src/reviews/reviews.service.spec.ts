import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Review } from './review.entity.js';
import { ServiceRequest } from '../service-requests/service-request.entity.js';
import { ServiceProvidersService } from '../service-providers/service-providers.service.js';
import type { CreateReviewDto } from './dto/create-review.dto.js';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ServiceRequestStatus } from '../service-requests/service-request-status.enum.js';
import { QueryFailedError } from 'typeorm';

describe('ReviewsService', () => {
  let service: ReviewsService;
  const repositoryMock = {
    create: vi.fn(),
    save: vi.fn(),
    find: vi.fn(),
    countBy: vi.fn(),
    average: vi.fn(),
    existsBy: vi.fn(),
  };
  const serviceRequestsRepositoryMock = {
    findOne: vi.fn(),
  };
  const serviceProvidersServiceMock = {
    findOne: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(Review), useValue: repositoryMock },
        {
          provide: getRepositoryToken(ServiceRequest),
          useValue: serviceRequestsRepositoryMock,
        },
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
    const serviceProviderId = 13;
    const userId = 7;
    const createReviewDto: CreateReviewDto = {
      serviceRequestId: 41,
      rating: 5,
      comment: 'Excellent service',
    };
    let serviceRequest: ServiceRequest;

    beforeEach(() => {
      serviceRequest = Object.assign(new ServiceRequest(), {
        id: 41,
        serviceProviderId,
        requesterUserId: userId,
        recipientUserId: 2,
        serviceOfferingId: 21,
        status: ServiceRequestStatus.COMPLETED,
        requesterUser: { id: userId, firstName: 'Alice', lastName: 'Martin' },
      });
      serviceProvidersServiceMock.findOne.mockResolvedValue({ id: serviceProviderId });
      serviceRequestsRepositoryMock.findOne.mockResolvedValue(serviceRequest);
      repositoryMock.existsBy.mockResolvedValue(false);
    });

    function expectNoReviewWrite() {
      expect(repositoryMock.create).not.toHaveBeenCalled();
      expect(repositoryMock.save).not.toHaveBeenCalled();
    }

    it('should persist the full review and return only public fields from the saved entity', async () => {
      const reviewData = {
        serviceProviderId,
        serviceRequestId: serviceRequest.id,
        authorName: 'Alice Martin',
        rating: createReviewDto.rating,
        comment: createReviewDto.comment,
      };
      const expectedReview = Object.assign(new Review(), {
        id: 8,
        ...reviewData,
        createdAt: new Date(),
      });
      const reviewToSave = Object.assign(new Review(), reviewData);
      repositoryMock.create.mockReturnValue(reviewToSave);
      repositoryMock.save.mockResolvedValue(expectedReview);

      const result = await service.create(serviceProviderId, createReviewDto, userId);

      expect(serviceProvidersServiceMock.findOne).toHaveBeenCalledWith(serviceProviderId);
      expect(serviceRequestsRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 41, serviceProviderId },
        relations: { requesterUser: true },
      });
      expect(repositoryMock.existsBy).toHaveBeenCalledWith({ serviceRequestId: 41 });
      expect(repositoryMock.create).toHaveBeenCalledExactlyOnceWith(reviewData);
      expect(repositoryMock.save).toHaveBeenCalledExactlyOnceWith(reviewToSave);
      expect(result).toStrictEqual({
        id: 8,
        authorName: 'Alice Martin',
        rating: 5,
        comment: createReviewDto.comment,
        createdAt: expectedReview.createdAt,
        serviceProviderId,
      });
      expect(expectedReview.serviceRequestId).toBe(41);
    });

    it('should stop before looking up the request when the provider does not exist', async () => {
      const error = new NotFoundException('Service provider not found');
      serviceProvidersServiceMock.findOne.mockRejectedValue(error);

      await expect(service.create(serviceProviderId, createReviewDto, userId)).rejects.toBe(error);

      expect(serviceRequestsRepositoryMock.findOne).not.toHaveBeenCalled();
      expectNoReviewWrite();
    });

    it('should reject a request that cannot be found for the targeted provider', async () => {
      serviceRequestsRepositoryMock.findOne.mockResolvedValue(null);

      await expect(service.create(serviceProviderId, createReviewDto, userId)).rejects.toThrow(
        new NotFoundException('Service request not found for this service provider'),
      );

      expect(serviceRequestsRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 41, serviceProviderId },
        relations: { requesterUser: true },
      });
      expect(repositoryMock.existsBy).not.toHaveBeenCalled();
      expectNoReviewWrite();
    });

    it('should forbid a review from an account other than the requester', async () => {
      await expect(service.create(serviceProviderId, createReviewDto, 2)).rejects.toThrow(
        new ForbiddenException('Only the requester can review this service'),
      );

      expect(repositoryMock.existsBy).not.toHaveBeenCalled();
      expectNoReviewWrite();
    });

    it.each([
      ServiceRequestStatus.SENT,
      ServiceRequestStatus.READ,
      ServiceRequestStatus.ACCEPTED,
      ServiceRequestStatus.REJECTED,
    ])('should reject a review when the request status is %s', async (status) => {
      serviceRequest.status = status;

      await expect(service.create(serviceProviderId, createReviewDto, userId)).rejects.toThrow(
        new ConflictException('Only completed service requests can be reviewed'),
      );

      expect(repositoryMock.existsBy).not.toHaveBeenCalled();
      expectNoReviewWrite();
    });

    it('should reject a request that already has a review without writing another review', async () => {
      repositoryMock.existsBy.mockResolvedValue(true);

      await expect(service.create(serviceProviderId, createReviewDto, userId)).rejects.toThrow(
        new ConflictException('This service request has already been reviewed'),
      );

      expect(repositoryMock.existsBy).toHaveBeenCalledExactlyOnceWith({ serviceRequestId: 41 });
      expectNoReviewWrite();
    });

    it('should allow a review after offering deletion when the completed request still identifies the provider', async () => {
      serviceRequest.serviceOfferingId = null;
      const expectedReview = Object.assign(new Review(), {
        id: 8,
        serviceRequestId: 41,
        serviceProviderId,
        authorName: 'Alice Martin',
        rating: 5,
        comment: createReviewDto.comment,
        createdAt: new Date(),
      });
      repositoryMock.create.mockReturnValue(expectedReview);
      repositoryMock.save.mockResolvedValue(expectedReview);

      await expect(
        service.create(serviceProviderId, createReviewDto, userId),
      ).resolves.toStrictEqual({
        id: 8,
        authorName: 'Alice Martin',
        rating: 5,
        comment: createReviewDto.comment,
        createdAt: expectedReview.createdAt,
        serviceProviderId,
      });

      expect(repositoryMock.save).toHaveBeenCalledExactlyOnceWith(expectedReview);
    });

    it('should return a conflict when another review is inserted after the existence check', async () => {
      const review = Object.assign(new Review(), { serviceRequestId: 41 });
      const driverError = Object.assign(
        new Error('UNIQUE constraint failed: reviews.serviceRequestId'),
        { code: 'SQLITE_CONSTRAINT_UNIQUE' },
      );
      repositoryMock.create.mockReturnValue(review);
      repositoryMock.save.mockRejectedValue(
        new QueryFailedError('INSERT INTO reviews ...', [], driverError),
      );

      await expect(
        service.create(serviceProviderId, createReviewDto, userId),
      ).rejects.toMatchObject({
        status: 409,
        message: 'This service request has already been reviewed',
      });

      expect(repositoryMock.existsBy).toHaveBeenCalledExactlyOnceWith({ serviceRequestId: 41 });
      expect(repositoryMock.save).toHaveBeenCalledExactlyOnceWith(review);
    });

    it.each([
      {
        label: 'another unique constraint',
        code: 'SQLITE_CONSTRAINT_UNIQUE',
        message: 'UNIQUE constraint failed: reviews.id',
      },
      {
        label: 'a foreign key failure',
        code: 'SQLITE_CONSTRAINT_FOREIGNKEY',
        message: 'FOREIGN KEY constraint failed',
      },
      { label: 'a locked database', code: 'SQLITE_BUSY', message: 'database is locked' },
    ])(
      'should propagate $label without reporting an already reviewed request',
      async ({ code, message }) => {
        const review = Object.assign(new Review(), { serviceRequestId: 41 });
        const driverError = Object.assign(new Error(message), { code });
        const error = new QueryFailedError('INSERT INTO reviews ...', [], driverError);
        repositoryMock.create.mockReturnValue(review);
        repositoryMock.save.mockRejectedValue(error);

        await expect(service.create(serviceProviderId, createReviewDto, userId)).rejects.toBe(
          error,
        );

        expect(repositoryMock.save).toHaveBeenCalledExactlyOnceWith(review);
      },
    );

    it('should propagate an unexpected persistence error without retrying the write', async () => {
      const review = Object.assign(new Review(), { serviceRequestId: 41 });
      const error = new Error('Database unavailable');
      repositoryMock.create.mockReturnValue(review);
      repositoryMock.save.mockRejectedValue(error);

      await expect(service.create(serviceProviderId, createReviewDto, userId)).rejects.toBe(error);

      expect(repositoryMock.save).toHaveBeenCalledExactlyOnceWith(review);
    });
  });

  describe('findAllForServiceProvider', () => {
    it('should return only public fields for linked and legacy reviews without mutating the entities', async () => {
      const serviceProviderId = 1;
      const createdAt = new Date('2026-10-20T08:00:00.000Z');
      const legacyCreatedAt = new Date('2026-10-19T08:00:00.000Z');
      const storedReviews = [
        Object.assign(new Review(), {
          id: 1,
          authorName: 'Alice Martin',
          rating: 5,
          comment: 'Excellent service',
          createdAt,
          serviceProviderId,
          serviceRequestId: 41,
          serviceRequest: Object.assign(new ServiceRequest(), {
            id: 41,
            message: 'Private message',
          }),
          serviceProvider: { id: serviceProviderId, ownerUserId: 2 },
        }),
        Object.assign(new Review(), {
          id: 2,
          authorName: 'Auteur historique',
          rating: 4,
          comment: 'Ancien avis',
          createdAt: legacyCreatedAt,
          serviceProviderId,
          serviceRequestId: null,
        }),
      ];
      serviceProvidersServiceMock.findOne.mockResolvedValue({ id: serviceProviderId });
      repositoryMock.find.mockResolvedValue(storedReviews);

      const result = await service.findAllForServiceProvider(serviceProviderId);

      expect(serviceProvidersServiceMock.findOne).toHaveBeenCalledWith(serviceProviderId);
      expect(repositoryMock.find).toHaveBeenCalledWith({
        where: { serviceProviderId },
        order: { createdAt: 'DESC' },
      });
      expect(result).toStrictEqual([
        {
          id: 1,
          authorName: 'Alice Martin',
          rating: 5,
          comment: 'Excellent service',
          createdAt,
          serviceProviderId,
        },
        {
          id: 2,
          authorName: 'Auteur historique',
          rating: 4,
          comment: 'Ancien avis',
          createdAt: legacyCreatedAt,
          serviceProviderId,
        },
      ]);
      expect(storedReviews[0].serviceRequestId).toBe(41);
      expect(storedReviews[0].serviceRequest!.message).toBe('Private message');
      expect(storedReviews[1].serviceRequestId).toBeNull();
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
