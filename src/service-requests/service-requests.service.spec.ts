import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ServiceRequestsService } from './service-requests.service.js';
import { ServiceRequest } from './service-request.entity.js';
import { ServiceRequestStatus } from './service-request-status.enum.js';
import { ServiceOffering } from '../service-offerings/service-offering.entity.js';
import { ServicePricingType } from '../service-offerings/service-pricing-type.enum.js';
import { ServiceProvidersService } from '../service-providers/service-providers.service.js';
import type { CreateServiceRequestDto } from './dto/create-service-request.dto.js';

describe('ServiceRequestsService', () => {
  let service: ServiceRequestsService;
  let offering: ServiceOffering;
  const requestRepositoryMock = {
    create: vi.fn(),
    save: vi.fn(),
    find: vi.fn(),
    findOneOrFail: vi.fn(),
  };
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
    requestRepositoryMock.save.mockImplementation(async (request) =>
      Object.assign(new ServiceRequest(), request, {
        id: 42,
        status: ServiceRequestStatus.SENT,
        createdAt: new Date('2026-10-10T09:30:00.000Z'),
      }),
    );
    requestRepositoryMock.findOneOrFail.mockImplementation(async () => {
      const savedRequest = await requestRepositoryMock.save.mock.results[0].value;
      return Object.assign(new ServiceRequest(), savedRequest, {
        internalNote: 'Internal value',
        requesterUser: {
          id: 8,
          firstName: 'Alice',
          lastName: 'Martin',
          email: 'alice@example.com',
          passwordHash: 'private-requester-hash',
        },
        recipientUser: {
          id: 7,
          firstName: 'Bruno',
          lastName: 'Leroy',
          email: 'bruno@example.com',
          passwordHash: 'private-recipient-hash',
        },
      });
    });

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
  ])(
    'should save and reload a $pricingType request with safe participant identities',
    async (pricing) => {
      Object.assign(offering, pricing);
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
      expect(requestRepositoryMock.findOneOrFail).toHaveBeenCalledExactlyOnceWith({
        where: { id: 42 },
        relations: { requesterUser: true, recipientUser: true },
      });
      expect(result).toEqual({
        id: 42,
        message: dto.message,
        status: ServiceRequestStatus.SENT,
        createdAt: new Date('2026-10-10T09:30:00.000Z'),
        requesterUserId: 8,
        recipientUserId: 7,
        serviceOfferingId: 12,
        offeringTitleSnapshot: 'Peinture',
        offeringPricingTypeSnapshot: pricing.pricingType,
        offeringHourlyRateSnapshot: pricing.hourlyRate,
        requester: { id: 8, firstName: 'Alice', lastName: 'Martin' },
        recipient: { id: 7, firstName: 'Bruno', lastName: 'Leroy' },
      });
    },
  );

  it('should stop before looking up the offering when the provider does not exist', async () => {
    const error = new NotFoundException('Service provider not found');
    providerServiceMock.findOne.mockRejectedValue(error);

    await expect(service.create(1, 12, dto, 8)).rejects.toBe(error);

    expect(offeringRepositoryMock.findOneBy).not.toHaveBeenCalled();
    expect(requestRepositoryMock.create).not.toHaveBeenCalled();
    expect(requestRepositoryMock.save).not.toHaveBeenCalled();
    expect(requestRepositoryMock.findOneOrFail).not.toHaveBeenCalled();
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
    expect(requestRepositoryMock.findOneOrFail).not.toHaveBeenCalled();
  });

  it('should reject a provider profile without an owner', async () => {
    providerServiceMock.findOne.mockResolvedValue({ id: 1, ownerUserId: null });

    await expect(service.create(1, 12, dto, 8)).rejects.toThrow(
      new ConflictException('This service provider profile has no owner'),
    );

    expect(requestRepositoryMock.create).not.toHaveBeenCalled();
    expect(requestRepositoryMock.save).not.toHaveBeenCalled();
    expect(requestRepositoryMock.findOneOrFail).not.toHaveBeenCalled();
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
    expect(requestRepositoryMock.findOneOrFail).not.toHaveBeenCalled();
  });

  it('should propagate a reload failure after saving the request', async () => {
    const error = new Error('Request reload failed');
    requestRepositoryMock.findOneOrFail.mockRejectedValue(error);

    await expect(service.create(1, 12, dto, 8)).rejects.toBe(error);

    expect(requestRepositoryMock.save).toHaveBeenCalledTimes(1);
    expect(requestRepositoryMock.findOneOrFail).toHaveBeenCalledExactlyOnceWith({
      where: { id: 42 },
      relations: { requesterUser: true, recipientUser: true },
    });
  });

  it.each([
    { method: 'findSentByUser' as const, field: 'requesterUserId' },
    { method: 'findReceivedByUser' as const, field: 'recipientUserId' },
  ])(
    'should scope $method to the user and return participant identities without private fields',
    async ({ method, field }) => {
      const createdAt = new Date('2026-10-10T09:30:00.000Z');
      const requesterId = method === 'findSentByUser' ? 8 : 7;
      const recipientId = method === 'findReceivedByUser' ? 8 : 7;
      const storedRequest = Object.assign(new ServiceRequest(), {
        id: 42,
        message: dto.message,
        status: ServiceRequestStatus.SENT,
        createdAt,
        requesterUserId: requesterId,
        recipientUserId: recipientId,
        serviceOfferingId: 12,
        offeringTitleSnapshot: 'Peinture',
        offeringPricingTypeSnapshot: ServicePricingType.HOURLY,
        offeringHourlyRateSnapshot: 30,
        internalNote: 'Internal value',
        requesterUser: {
          id: requesterId,
          firstName: 'Alice',
          lastName: 'Martin',
          email: 'alice@example.com',
          passwordHash: 'private-requester-hash',
          createdAt,
        },
        recipientUser: {
          id: recipientId,
          firstName: 'Bruno',
          lastName: 'Leroy',
          email: 'bruno@example.com',
          passwordHash: 'private-recipient-hash',
          createdAt,
        },
      });
      requestRepositoryMock.find.mockResolvedValue([storedRequest]);

      const result = await service[method](8);

      expect(requestRepositoryMock.find).toHaveBeenCalledExactlyOnceWith({
        where: { [field]: 8 },
        relations: { requesterUser: true, recipientUser: true },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
      expect(result).toEqual([
        {
          id: 42,
          message: dto.message,
          status: ServiceRequestStatus.SENT,
          createdAt,
          requesterUserId: requesterId,
          recipientUserId: recipientId,
          serviceOfferingId: 12,
          offeringTitleSnapshot: 'Peinture',
          offeringPricingTypeSnapshot: ServicePricingType.HOURLY,
          offeringHourlyRateSnapshot: 30,
          requester: { id: requesterId, firstName: 'Alice', lastName: 'Martin' },
          recipient: { id: recipientId, firstName: 'Bruno', lastName: 'Leroy' },
        },
      ]);
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
