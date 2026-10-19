import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
    findOne: vi.fn(),
    update: vi.fn(),
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
        serviceProviderId: 1,
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
        serviceProviderId: 1,
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
      serviceProviderId: 99,
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
      serviceProviderId: 1,
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

  it.each(
    [
      { method: 'findSentByUser' as const, field: 'requesterUserId' },
      { method: 'findReceivedByUser' as const, field: 'recipientUserId' },
    ].flatMap((mode) => [1, null].map((serviceProviderId) => ({ ...mode, serviceProviderId }))),
  )(
    'should scope $method to the user and return provider link $serviceProviderId without private participant fields',
    async ({ method, field, serviceProviderId }) => {
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
        serviceOfferingId: serviceProviderId === null ? null : 12,
        serviceProviderId,
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
          serviceOfferingId: serviceProviderId === null ? null : 12,
          serviceProviderId,
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

  describe('updateStatus', () => {
    let statusRequest: ServiceRequest;
    const createdAt = new Date('2026-10-14T10:00:00.000Z');
    const validTransitions = [
      { from: ServiceRequestStatus.SENT, to: ServiceRequestStatus.READ },
      { from: ServiceRequestStatus.SENT, to: ServiceRequestStatus.ACCEPTED },
      { from: ServiceRequestStatus.SENT, to: ServiceRequestStatus.REJECTED },
      { from: ServiceRequestStatus.READ, to: ServiceRequestStatus.ACCEPTED },
      { from: ServiceRequestStatus.READ, to: ServiceRequestStatus.REJECTED },
      { from: ServiceRequestStatus.ACCEPTED, to: ServiceRequestStatus.COMPLETED },
    ];
    const invalidTransitions = Object.values(ServiceRequestStatus).flatMap((from) =>
      Object.values(ServiceRequestStatus)
        .filter(
          (to) =>
            !validTransitions.some(
              (transition) => transition.from === from && transition.to === to,
            ),
        )
        .map((to) => ({ from, to })),
    );

    function expectedResponse(
      status: ServiceRequestStatus,
      serviceOfferingId: number | null = 12,
      serviceProviderId: number | null = 1,
    ) {
      return {
        id: 42,
        message: dto.message,
        status,
        createdAt,
        requesterUserId: 8,
        recipientUserId: 7,
        serviceOfferingId,
        serviceProviderId,
        offeringTitleSnapshot: 'Peinture',
        offeringPricingTypeSnapshot: ServicePricingType.HOURLY,
        offeringHourlyRateSnapshot: 35,
        requester: { id: 8, firstName: 'Alice', lastName: 'Martin' },
        recipient: { id: 7, firstName: 'Bruno', lastName: 'Leroy' },
      };
    }

    beforeEach(() => {
      statusRequest = Object.assign(new ServiceRequest(), {
        id: 42,
        message: dto.message,
        status: ServiceRequestStatus.SENT,
        createdAt,
        requesterUserId: 8,
        recipientUserId: 7,
        serviceOfferingId: 12,
        serviceProviderId: 1,
        offeringTitleSnapshot: 'Peinture',
        offeringPricingTypeSnapshot: ServicePricingType.HOURLY,
        offeringHourlyRateSnapshot: 35,
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
      requestRepositoryMock.findOne.mockResolvedValue(statusRequest);
      requestRepositoryMock.update.mockResolvedValue({ affected: 1 });
    });

    it.each(validTransitions)(
      'should allow the recipient to change $from to $to and return a safe response',
      async ({ from, to }) => {
        statusRequest.status = from;

        const result = await service.updateStatus(42, { status: to }, 7);

        expect(requestRepositoryMock.findOne).toHaveBeenCalledExactlyOnceWith({
          where: { id: 42 },
          relations: { requesterUser: true, recipientUser: true },
        });
        expect(requestRepositoryMock.update).toHaveBeenCalledExactlyOnceWith(
          { id: 42, recipientUserId: 7, status: from },
          { status: to },
        );
        expect(result).toEqual(expectedResponse(to));
        expect(requestRepositoryMock.save).not.toHaveBeenCalled();
      },
    );

    it.each(invalidTransitions)(
      'should reject the transition from $from to $to without writing to the database',
      async ({ from, to }) => {
        statusRequest.status = from;

        await expect(service.updateStatus(42, { status: to }, 7)).rejects.toThrow(
          new ConflictException('This status transition is not allowed'),
        );

        expect(requestRepositoryMock.update).not.toHaveBeenCalled();
        expect(statusRequest.status).toBe(from);
      },
    );

    it('should report a missing request before attempting an update', async () => {
      requestRepositoryMock.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus(42, { status: ServiceRequestStatus.READ }, 7),
      ).rejects.toThrow(new NotFoundException('Service request not found'));

      expect(requestRepositoryMock.update).not.toHaveBeenCalled();
    });

    it.each([
      { label: 'the requester', userId: 8, status: ServiceRequestStatus.SENT },
      { label: 'an unrelated account', userId: 99, status: ServiceRequestStatus.READ },
      {
        label: 'an unrelated account on an accepted request',
        userId: 99,
        status: ServiceRequestStatus.ACCEPTED,
      },
    ])(
      'should refuse $label before checking transitions or updating the request',
      async ({ userId, status }) => {
        statusRequest.status = status;

        await expect(
          service.updateStatus(42, { status: ServiceRequestStatus.READ }, userId),
        ).rejects.toThrow(new ForbiddenException('Only the recipient can update this request'));

        expect(requestRepositoryMock.update).not.toHaveBeenCalled();
        expect(statusRequest.status).toBe(status);
      },
    );

    it.each([8, 99])(
      "should prevent account %s from completing another recipient's accepted request",
      async (userId) => {
        statusRequest.status = ServiceRequestStatus.ACCEPTED;

        await expect(
          service.updateStatus(42, { status: ServiceRequestStatus.COMPLETED }, userId),
        ).rejects.toThrow(new ForbiddenException('Only the recipient can update this request'));

        expect(requestRepositoryMock.update).not.toHaveBeenCalled();
        expect(statusRequest.status).toBe(ServiceRequestStatus.ACCEPTED);
      },
    );

    it.each([
      { from: ServiceRequestStatus.SENT, to: ServiceRequestStatus.ACCEPTED },
      { from: ServiceRequestStatus.ACCEPTED, to: ServiceRequestStatus.COMPLETED },
    ])(
      'should reject a stale $from to $to update when no row matches the original state',
      async ({ from, to }) => {
        statusRequest.status = from;
        requestRepositoryMock.update.mockResolvedValue({ affected: 0 });

        await expect(service.updateStatus(42, { status: to }, 7)).rejects.toThrow(
          new ConflictException('Service request changed. Refresh and try again'),
        );

        expect(requestRepositoryMock.update).toHaveBeenCalledExactlyOnceWith(
          { id: 42, recipientUserId: 7, status: from },
          { status: to },
        );
        expect(statusRequest.status).toBe(from);
      },
    );

    it.each([
      { from: ServiceRequestStatus.SENT, to: ServiceRequestStatus.ACCEPTED },
      { from: ServiceRequestStatus.ACCEPTED, to: ServiceRequestStatus.COMPLETED },
    ])(
      'should allow the recorded recipient to change $from to $to after offering deletion',
      async ({ from, to }) => {
        statusRequest.serviceOfferingId = null;
        statusRequest.status = from;

        const result = await service.updateStatus(42, { status: to }, 7);

        expect(result).toEqual(expectedResponse(to, null));
        expect(providerServiceMock.findOne).not.toHaveBeenCalled();
        expect(offeringRepositoryMock.findOneBy).not.toHaveBeenCalled();
        expect(requestRepositoryMock.update).toHaveBeenCalledExactlyOnceWith(
          { id: 42, recipientUserId: 7, status: from },
          { status: to },
        );
      },
    );

    it('should return a null provider link when completing a request after profile deletion', async () => {
      statusRequest.status = ServiceRequestStatus.ACCEPTED;
      statusRequest.serviceOfferingId = null;
      statusRequest.serviceProviderId = null;

      const result = await service.updateStatus(42, { status: ServiceRequestStatus.COMPLETED }, 7);

      expect(result).toEqual(expectedResponse(ServiceRequestStatus.COMPLETED, null, null));
      expect(providerServiceMock.findOne).not.toHaveBeenCalled();
      expect(offeringRepositoryMock.findOneBy).not.toHaveBeenCalled();
    });

    it('should update only status even if a caller supplies extra identities, message or snapshots', async () => {
      const forgedDto = {
        status: ServiceRequestStatus.READ,
        message: 'Forged message',
        requesterUserId: 99,
        recipientUserId: 99,
        serviceOfferingId: 99,
        serviceProviderId: 99,
        offeringTitleSnapshot: 'Forged title',
        offeringPricingTypeSnapshot: ServicePricingType.FREE,
        offeringHourlyRateSnapshot: null,
      };

      const result = await service.updateStatus(42, forgedDto, 7);

      expect(requestRepositoryMock.update).toHaveBeenCalledExactlyOnceWith(
        { id: 42, recipientUserId: 7, status: ServiceRequestStatus.SENT },
        { status: ServiceRequestStatus.READ },
      );
      expect(result).toEqual(expectedResponse(ServiceRequestStatus.READ));
    });

    it('should propagate a read failure without attempting an update', async () => {
      const error = new Error('Database read failed');
      requestRepositoryMock.findOne.mockRejectedValue(error);

      await expect(service.updateStatus(42, { status: ServiceRequestStatus.READ }, 7)).rejects.toBe(
        error,
      );

      expect(requestRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('should propagate a write failure instead of returning a successful status response', async () => {
      const error = new Error('Database write failed');
      requestRepositoryMock.update.mockRejectedValue(error);

      await expect(
        service.updateStatus(42, { status: ServiceRequestStatus.ACCEPTED }, 7),
      ).rejects.toBe(error);

      expect(statusRequest.status).toBe(ServiceRequestStatus.SENT);
    });

    it('should wait for the conditional database update before resolving the response', async () => {
      let completeWrite!: (result: { affected: number }) => void;
      const writeResult = new Promise<{ affected: number }>((resolve) => {
        completeWrite = resolve;
      });
      requestRepositoryMock.update.mockReturnValue(writeResult);
      const settledSpy = vi.fn();

      const pendingResponse = service.updateStatus(
        42,
        { status: ServiceRequestStatus.ACCEPTED },
        7,
      );
      void pendingResponse.then(settledSpy, settledSpy);
      await Promise.resolve();

      expect(requestRepositoryMock.update).toHaveBeenCalledTimes(1);
      expect(settledSpy).not.toHaveBeenCalled();
      completeWrite({ affected: 1 });
      await expect(pendingResponse).resolves.toEqual(
        expectedResponse(ServiceRequestStatus.ACCEPTED),
      );
      expect(settledSpy).toHaveBeenCalledExactlyOnceWith(
        expectedResponse(ServiceRequestStatus.ACCEPTED),
      );
    });
  });
});
