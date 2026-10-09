import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ServiceRequestsService } from './service-requests.service.js';
import { ServiceRequest } from './service-request.entity.js';
import { ServiceOffering } from '../service-offerings/service-offering.entity.js';
import { ServicePricingType } from '../service-offerings/service-pricing-type.enum.js';
import { ServiceProvidersService } from '../service-providers/service-providers.service.js';
import type { CreateServiceRequestDto } from './dto/create-service-request.dto.js';

describe('ServiceRequestsService', () => {
  let service: ServiceRequestsService;
  let offering: ServiceOffering;
  const requestRepositoryMock = { create: vi.fn(), save: vi.fn(), find: vi.fn() };
  const offeringRepositoryMock = { findOneBy: vi.fn() };
  const providerServiceMock = { findOne: vi.fn() };
  const dto: CreateServiceRequestDto = { message: 'Bonjour, je souhaite repeindre ma chambre.' };

  beforeEach(async () => {
    vi.resetAllMocks();
    offering = Object.assign(new ServiceOffering(), {
      id: 12,
      serviceProviderId: 1,
      title: 'Peinture',
      description: 'Peinture intérieure.',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 30,
    });
    providerServiceMock.findOne.mockResolvedValue({ id: 1, ownerUserId: 7 });
    offeringRepositoryMock.findOneBy.mockResolvedValue(offering);
    requestRepositoryMock.create.mockImplementation((values) =>
      Object.assign(new ServiceRequest(), values),
    );
    requestRepositoryMock.save.mockImplementation(async (request) => request);

    const module = await Test.createTestingModule({
      providers: [
        ServiceRequestsService,
        { provide: getRepositoryToken(ServiceRequest), useValue: requestRepositoryMock },
        { provide: getRepositoryToken(ServiceOffering), useValue: offeringRepositoryMock },
        { provide: ServiceProvidersService, useValue: providerServiceMock },
      ],
    }).compile();
    service = module.get(ServiceRequestsService);
  });

  it.each([
    { pricingType: ServicePricingType.HOURLY, hourlyRate: 30 },
    { pricingType: ServicePricingType.FREE, hourlyRate: null },
  ])('should create a request with a $pricingType offering snapshot', async (pricing) => {
    Object.assign(offering, pricing);
    const savedRequest = Object.assign(new ServiceRequest(), { id: 42 });
    requestRepositoryMock.save.mockResolvedValue(savedRequest);

    const result = await service.create(1, 12, dto, 8);

    expect(providerServiceMock.findOne).toHaveBeenCalledExactlyOnceWith(1);
    expect(offeringRepositoryMock.findOneBy).toHaveBeenCalledExactlyOnceWith({
      id: 12,
      serviceProviderId: 1,
    });
    expect(requestRepositoryMock.create).toHaveBeenCalledExactlyOnceWith({
      message: dto.message,
      requesterUserId: 8,
      recipientUserId: 7,
      serviceOfferingId: 12,
      offeringTitleSnapshot: 'Peinture',
      offeringPricingTypeSnapshot: pricing.pricingType,
      offeringHourlyRateSnapshot: pricing.hourlyRate,
    });
    expect(requestRepositoryMock.save).toHaveBeenCalledExactlyOnceWith(
      requestRepositoryMock.create.mock.results[0].value,
    );
    expect(result).toBe(savedRequest);
  });

  it('should stop before looking up the offering when the provider does not exist', async () => {
    const error = new NotFoundException('Service provider not found');
    providerServiceMock.findOne.mockRejectedValue(error);

    await expect(service.create(1, 12, dto, 8)).rejects.toBe(error);

    expect(offeringRepositoryMock.findOneBy).not.toHaveBeenCalled();
    expect(requestRepositoryMock.create).not.toHaveBeenCalled();
    expect(requestRepositoryMock.save).not.toHaveBeenCalled();
  });

  it('should reject an offering not found for the specified provider', async () => {
    offeringRepositoryMock.findOneBy.mockResolvedValue(null);

    await expect(service.create(1, 12, dto, 8)).rejects.toThrow(
      new NotFoundException('Service offering not found'),
    );

    expect(offeringRepositoryMock.findOneBy).toHaveBeenCalledExactlyOnceWith({
      id: 12,
      serviceProviderId: 1,
    });
    expect(requestRepositoryMock.create).not.toHaveBeenCalled();
    expect(requestRepositoryMock.save).not.toHaveBeenCalled();
  });

  it('should reject a provider profile without an owner', async () => {
    providerServiceMock.findOne.mockResolvedValue({ id: 1, ownerUserId: null });

    await expect(service.create(1, 12, dto, 8)).rejects.toThrow(
      new ConflictException('This service provider profile has no owner'),
    );

    expect(requestRepositoryMock.create).not.toHaveBeenCalled();
    expect(requestRepositoryMock.save).not.toHaveBeenCalled();
  });

  it('should ignore client-supplied identities, snapshots and status', async () => {
    const forgedDto = {
      ...dto,
      requesterUserId: 99,
      recipientUserId: 99,
      serviceOfferingId: 99,
      offeringTitleSnapshot: 'Faux titre',
      offeringPricingTypeSnapshot: ServicePricingType.FREE,
      offeringHourlyRateSnapshot: 1,
      status: 'ACCEPTED',
    };

    await service.create(1, 12, forgedDto, 8);

    expect(requestRepositoryMock.create).toHaveBeenCalledExactlyOnceWith({
      message: dto.message,
      requesterUserId: 8,
      recipientUserId: 7,
      serviceOfferingId: 12,
      offeringTitleSnapshot: 'Peinture',
      offeringPricingTypeSnapshot: ServicePricingType.HOURLY,
      offeringHourlyRateSnapshot: 30,
    });
  });

  it('should propagate a save failure', async () => {
    const error = new Error('Database unavailable');
    requestRepositoryMock.save.mockRejectedValue(error);

    await expect(service.create(1, 12, dto, 8)).rejects.toBe(error);
  });
  it.each([
    { method: 'findSentByUser' as const, field: 'requesterUserId' },
    { method: 'findReceivedByUser' as const, field: 'recipientUserId' },
  ])(
    'should scope $method to the supplied user and return the repository results',
    async ({ method, field }) => {
      const requests = [Object.assign(new ServiceRequest(), { id: 42 })];
      requestRepositoryMock.find.mockResolvedValue(requests);

      const result = await service[method](8);

      expect(requestRepositoryMock.find).toHaveBeenCalledExactlyOnceWith({
        where: { [field]: 8 },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
      expect(result).toBe(requests);
    },
  );

  it.each(['findSentByUser', 'findReceivedByUser'] as const)(
    'should return an empty list from %s when the user has no requests',
    async (method) => {
      requestRepositoryMock.find.mockResolvedValue([]);

      await expect(service[method](8)).resolves.toEqual([]);
    },
  );
});
