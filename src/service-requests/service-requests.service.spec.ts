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
import { Review } from '../reviews/review.entity.js';
import { ServiceRequestMessage } from './service-request-message.entity.js';
import { IsNull, LessThanOrEqual, Not } from 'typeorm';
import type { CreateServiceRequestMessageDto } from './dto/create-service-request-message.dto.js';

describe('ServiceRequestsService', () => {
  let service: ServiceRequestsService;
  let offering: ServiceOffering;
  const requestRepositoryMock = {
    create: vi.fn(),
    save: vi.fn(),
    find: vi.fn(),
    findOneOrFail: vi.fn(),
    findOne: vi.fn(),
    findOneBy: vi.fn(),
    update: vi.fn(),
  };
  const messageRepositoryMock = {
    create: vi.fn(),
    save: vi.fn(),
    findOneOrFail: vi.fn(),
    find: vi.fn(),
    findOneBy: vi.fn(),
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
        review: null,
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
        { provide: getRepositoryToken(ServiceRequestMessage), useValue: messageRepositoryMock },
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
        relations: { requesterUser: true, recipientUser: true, review: true },
      });
      expect(result).toEqual({
        id: 42,
        message: dto.message,
        status: ServiceRequestStatus.SENT,
        hasReview: false,
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
      relations: { requesterUser: true, recipientUser: true, review: true },
    });
  });

  it.each(
    [
      { method: 'findSentByUser' as const, field: 'requesterUserId' },
      { method: 'findReceivedByUser' as const, field: 'recipientUserId' },
    ].flatMap((mode) =>
      [1, null].flatMap((serviceProviderId) =>
        (serviceProviderId === null ? [false] : [false, true]).map((hasReview) => ({
          ...mode,
          serviceProviderId,
          hasReview,
        })),
      ),
    ),
  )(
    'should scope $method to the user and return provider link $serviceProviderId with hasReview $hasReview without leaking loaded relations',
    async ({ method, field, serviceProviderId, hasReview }) => {
      const createdAt = new Date('2026-10-10T09:30:00.000Z');
      const requesterId = method === 'findSentByUser' ? 8 : 7;
      const recipientId = method === 'findReceivedByUser' ? 8 : 7;
      const storedRequest = Object.assign(new ServiceRequest(), {
        id: 42,
        message: dto.message,
        status: ServiceRequestStatus.COMPLETED,
        createdAt,
        requesterUserId: requesterId,
        recipientUserId: recipientId,
        serviceOfferingId: serviceProviderId === null ? null : 12,
        serviceProviderId,
        offeringTitleSnapshot: 'Peinture',
        offeringPricingTypeSnapshot: ServicePricingType.HOURLY,
        offeringHourlyRateSnapshot: 30,
        review: hasReview
          ? Object.assign(new Review(), {
              id: 10,
              serviceRequestId: 42,
              serviceProviderId,
              authorName: 'Alice Martin',
              rating: 5,
              comment: 'Loaded review content must not be returned here.',
              createdAt,
            })
          : null,
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
        relations: { requesterUser: true, recipientUser: true, review: true },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
      expect(result).toEqual([
        {
          id: 42,
          message: dto.message,
          status: ServiceRequestStatus.COMPLETED,
          hasReview,
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

  describe('createMessage', () => {
    let conversation: ServiceRequest;
    const content = '  Bonjour, disponible samedi ?\nMerci !  ';
    const createdAt = new Date('2026-10-22T12:00:00.000Z');
    const authors = {
      8: { id: 8, firstName: 'Alice', lastName: 'Martin' },
      7: { id: 7, firstName: 'Bruno', lastName: 'Leroy' },
    };

    function expectNoMessageWrite() {
      expect(messageRepositoryMock.create).not.toHaveBeenCalled();
      expect(messageRepositoryMock.save).not.toHaveBeenCalled();
      expect(messageRepositoryMock.findOneOrFail).not.toHaveBeenCalled();
    }

    beforeEach(() => {
      conversation = Object.assign(new ServiceRequest(), {
        id: 42,
        requesterUserId: 8,
        recipientUserId: 7,
        status: ServiceRequestStatus.SENT,
        serviceProviderId: 1,
        serviceOfferingId: 12,
      });
      requestRepositoryMock.findOneBy.mockResolvedValue(conversation);
      messageRepositoryMock.create.mockImplementation((values) =>
        Object.assign(new ServiceRequestMessage(), values),
      );
      messageRepositoryMock.save.mockImplementation(async (message) =>
        Object.assign(new ServiceRequestMessage(), message, { id: 101, createdAt }),
      );
      messageRepositoryMock.findOneOrFail.mockImplementation(async () => {
        const saved = await messageRepositoryMock.save.mock.results[0].value;
        return Object.assign(new ServiceRequestMessage(), saved, {
          internalNote: 'Internal message data',
          serviceRequest: conversation,
          authorUser: {
            ...authors[saved.authorUserId as keyof typeof authors],
            email: 'private@example.test',
            passwordHash: 'private-author-hash',
          },
        });
      });
    });

    it.each([8, 7] as const)(
      'should allow participant %s to save an unread message, reload its message id and return only safe response fields',
      async (userId) => {
        const result = await service.createMessage(42, { content }, userId);

        expect(requestRepositoryMock.findOneBy).toHaveBeenCalledExactlyOnceWith({ id: 42 });
        expect(messageRepositoryMock.create).toHaveBeenCalledExactlyOnceWith({
          content,
          serviceRequestId: 42,
          authorUserId: userId,
          readAt: null,
        });
        expect(messageRepositoryMock.save).toHaveBeenCalledExactlyOnceWith(
          messageRepositoryMock.create.mock.results[0].value,
        );
        expect(messageRepositoryMock.findOneOrFail).toHaveBeenCalledExactlyOnceWith({
          where: { id: 101 },
          relations: { authorUser: true },
        });
        expect(result).toEqual({
          id: 101,
          content,
          createdAt,
          readAt: null,
          serviceRequestId: 42,
          authorUserId: userId,
          author: authors[userId],
        });
        expect(conversation.status).toBe(ServiceRequestStatus.SENT);
        expect(requestRepositoryMock.save).not.toHaveBeenCalled();
        expect(requestRepositoryMock.update).not.toHaveBeenCalled();
      },
    );

    it('should refuse a missing request before constructing or saving a message', async () => {
      requestRepositoryMock.findOneBy.mockResolvedValue(null);

      await expect(service.createMessage(42, { content }, 8)).rejects.toThrow(
        new NotFoundException('Service request not found'),
      );

      expectNoMessageWrite();
    });

    it('should refuse an unrelated account before constructing or saving a message', async () => {
      await expect(service.createMessage(42, { content }, 99)).rejects.toThrow(
        new ForbiddenException('Only request participants can access this conversation'),
      );

      expectNoMessageWrite();
    });

    it('should derive message identities and unread state from trusted arguments instead of extra DTO properties', async () => {
      const forgedDto = {
        content,
        id: 999,
        serviceRequestId: 999,
        authorUserId: 99,
        createdAt: new Date('2000-01-01T00:00:00.000Z'),
        readAt: createdAt,
        authorUser: { id: 99, firstName: 'Forged', lastName: 'Author' },
      } satisfies CreateServiceRequestMessageDto & Record<string, unknown>;

      const result = await service.createMessage(42, forgedDto, 8);

      expect(messageRepositoryMock.create).toHaveBeenCalledExactlyOnceWith({
        content,
        serviceRequestId: 42,
        authorUserId: 8,
        readAt: null,
      });
      expect(result.id).toBe(101);
      expect(result.createdAt).toEqual(createdAt);
      expect(result.readAt).toBeNull();
      expect(result.author).toEqual(authors[8]);
    });

    it('should keep historical conversations usable by their recorded participants after provider and offering deletion', async () => {
      conversation.serviceProviderId = null;
      conversation.serviceOfferingId = null;
      conversation.status = ServiceRequestStatus.COMPLETED;

      const result = await service.createMessage(42, { content }, 7);

      expect(result.serviceRequestId).toBe(42);
      expect(result.authorUserId).toBe(7);
      expect(result.author).toEqual(authors[7]);
      expect(providerServiceMock.findOne).not.toHaveBeenCalled();
      expect(offeringRepositoryMock.findOneBy).not.toHaveBeenCalled();
      expect(conversation.status).toBe(ServiceRequestStatus.COMPLETED);
    });

    it('should propagate a request lookup failure without attempting to write a message', async () => {
      const error = new Error('Request database unavailable');
      requestRepositoryMock.findOneBy.mockRejectedValue(error);

      await expect(service.createMessage(42, { content }, 8)).rejects.toBe(error);

      expectNoMessageWrite();
    });

    it('should propagate a message save failure without reloading or returning a successful response', async () => {
      const error = new Error('Message database unavailable');
      messageRepositoryMock.save.mockRejectedValue(error);

      await expect(service.createMessage(42, { content }, 8)).rejects.toBe(error);

      expect(messageRepositoryMock.findOneOrFail).not.toHaveBeenCalled();
    });

    it('should propagate a reload failure after saving instead of returning an incomplete message', async () => {
      const error = new Error('Message reload failed');
      messageRepositoryMock.findOneOrFail.mockRejectedValue(error);

      await expect(service.createMessage(42, { content }, 8)).rejects.toBe(error);

      expect(messageRepositoryMock.save).toHaveBeenCalledOnce();
    });

    it('should wait for the participant check before creating a message', async () => {
      let finishLookup!: (request: ServiceRequest | null) => void;
      requestRepositoryMock.findOneBy.mockReturnValue(
        new Promise<ServiceRequest | null>((resolve) => {
          finishLookup = resolve;
        }),
      );
      const response = service.createMessage(42, { content }, 99);
      const rejection = expect(response).rejects.toThrow(ForbiddenException);

      expectNoMessageWrite();
      finishLookup(conversation);
      await rejection;
      expectNoMessageWrite();
    });
  });

  describe('findMessages', () => {
    let conversation: ServiceRequest;
    let storedMessages: ServiceRequestMessage[];
    const sentAt = new Date('2026-10-22T10:00:00.000Z');
    const repliedAt = new Date('2026-10-22T11:00:00.000Z');
    const readAt = new Date('2026-10-22T10:30:00.000Z');

    function expectNoWrites() {
      expect(messageRepositoryMock.create).not.toHaveBeenCalled();
      expect(messageRepositoryMock.save).not.toHaveBeenCalled();
      expect(requestRepositoryMock.update).not.toHaveBeenCalled();
      expect(requestRepositoryMock.save).not.toHaveBeenCalled();
    }

    beforeEach(() => {
      conversation = Object.assign(new ServiceRequest(), {
        id: 42,
        requesterUserId: 8,
        recipientUserId: 7,
        status: ServiceRequestStatus.ACCEPTED,
        serviceProviderId: 1,
        serviceOfferingId: 12,
      });
      storedMessages = [
        Object.assign(new ServiceRequestMessage(), {
          id: 101,
          content: 'Disponible samedi ?',
          createdAt: sentAt,
          readAt,
          serviceRequestId: 42,
          authorUserId: 8,
          serviceRequest: conversation,
          internalNote: 'Private message detail',
          authorUser: {
            id: 8,
            firstName: 'Alice',
            lastName: 'Martin',
            email: 'private-a@example.test',
            passwordHash: 'private-hash-a',
          },
        }),
        Object.assign(new ServiceRequestMessage(), {
          id: 102,
          content: 'Oui, samedi matin.',
          createdAt: repliedAt,
          readAt: null,
          serviceRequestId: 42,
          authorUserId: 7,
          serviceRequest: conversation,
          internalNote: 'Private message detail',
          authorUser: {
            id: 7,
            firstName: 'Bruno',
            lastName: 'Leroy',
            email: 'private-b@example.test',
            passwordHash: 'private-hash-b',
          },
        }),
      ];
      requestRepositoryMock.findOneBy.mockResolvedValue(conversation);
      messageRepositoryMock.find.mockResolvedValue(storedMessages);
    });

    it.each([8, 7])(
      'should let participant %s read only the selected conversation using chronological ordering and safe author fields',
      async (userId) => {
        const result = await service.findMessages(42, userId);

        expect(requestRepositoryMock.findOneBy).toHaveBeenCalledExactlyOnceWith({ id: 42 });
        expect(messageRepositoryMock.find).toHaveBeenCalledExactlyOnceWith({
          where: { serviceRequestId: 42 },
          relations: { authorUser: true },
          order: { createdAt: 'ASC', id: 'ASC' },
        });
        expect(result).toEqual([
          {
            id: 101,
            content: 'Disponible samedi ?',
            createdAt: sentAt,
            readAt,
            serviceRequestId: 42,
            authorUserId: 8,
            author: { id: 8, firstName: 'Alice', lastName: 'Martin' },
          },
          {
            id: 102,
            content: 'Oui, samedi matin.',
            createdAt: repliedAt,
            readAt: null,
            serviceRequestId: 42,
            authorUserId: 7,
            author: { id: 7, firstName: 'Bruno', lastName: 'Leroy' },
          },
        ]);
        expect(storedMessages[0].readAt).toEqual(readAt);
        expect(storedMessages[1].readAt).toBeNull();
        expect(conversation.status).toBe(ServiceRequestStatus.ACCEPTED);
        expectNoWrites();
      },
    );

    it('should return an empty array for an accessible conversation without replies', async () => {
      messageRepositoryMock.find.mockResolvedValue([]);

      await expect(service.findMessages(42, 8)).resolves.toEqual([]);

      expect(requestRepositoryMock.findOneBy).toHaveBeenCalledExactlyOnceWith({ id: 42 });
      expect(messageRepositoryMock.find).toHaveBeenCalledOnce();
      expectNoWrites();
    });

    it('should refuse a missing conversation before reading its messages', async () => {
      requestRepositoryMock.findOneBy.mockResolvedValue(null);

      await expect(service.findMessages(42, 8)).rejects.toThrow(
        new NotFoundException('Service request not found'),
      );

      expect(messageRepositoryMock.find).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it('should refuse an unrelated account before reading any messages', async () => {
      await expect(service.findMessages(42, 99)).rejects.toThrow(
        new ForbiddenException('Only request participants can access this conversation'),
      );

      expect(messageRepositoryMock.find).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it('should propagate a participant lookup failure without reading any messages', async () => {
      const error = new Error('Request lookup unavailable');
      requestRepositoryMock.findOneBy.mockRejectedValue(error);

      await expect(service.findMessages(42, 8)).rejects.toBe(error);

      expect(messageRepositoryMock.find).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it('should propagate a message query failure instead of treating it as an empty conversation', async () => {
      const error = new Error('Message query unavailable');
      messageRepositoryMock.find.mockRejectedValue(error);

      await expect(service.findMessages(42, 8)).rejects.toBe(error);

      expectNoWrites();
    });

    it('should keep a historical conversation readable after its provider and offering are deleted', async () => {
      conversation.serviceProviderId = null;
      conversation.serviceOfferingId = null;
      conversation.status = ServiceRequestStatus.COMPLETED;

      const result = await service.findMessages(42, 7);

      expect(result).toHaveLength(2);
      expect(result.every((message) => message.serviceRequestId === 42)).toBe(true);
      expect(providerServiceMock.findOne).not.toHaveBeenCalled();
      expect(offeringRepositoryMock.findOneBy).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it('should finish checking participation before starting the message query', async () => {
      let finishLookup!: (request: ServiceRequest) => void;
      requestRepositoryMock.findOneBy.mockReturnValue(
        new Promise<ServiceRequest>((resolve) => {
          finishLookup = resolve;
        }),
      );

      const result = service.findMessages(42, 8);

      expect(messageRepositoryMock.find).not.toHaveBeenCalled();
      finishLookup(conversation);
      await expect(result).resolves.toHaveLength(2);
      expect(messageRepositoryMock.find).toHaveBeenCalledOnce();
      expectNoWrites();
    });
  });

  describe('markMessagesAsRead', () => {
    let conversation: ServiceRequest;
    let boundary: ServiceRequestMessage;
    const dto = { upToMessageId: 102 };

    beforeEach(() => {
      conversation = Object.assign(new ServiceRequest(), {
        id: 42,
        requesterUserId: 8,
        recipientUserId: 7,
        status: ServiceRequestStatus.ACCEPTED,
      });
      boundary = Object.assign(new ServiceRequestMessage(), {
        id: 102,
        serviceRequestId: 42,
        authorUserId: 8,
        readAt: null,
      });
      requestRepositoryMock.findOneBy.mockResolvedValue(conversation);
      messageRepositoryMock.findOneBy.mockResolvedValue(boundary);
      messageRepositoryMock.update.mockResolvedValue({ affected: 1 });
    });

    it.each([8, 7])(
      'should let participant %s update only unread received messages in this conversation up to the validated boundary',
      async (userId) => {
        const startedAt = Date.now();

        await expect(service.markMessagesAsRead(42, dto, userId)).resolves.toBeUndefined();

        expect(requestRepositoryMock.findOneBy).toHaveBeenCalledExactlyOnceWith({ id: 42 });
        expect(messageRepositoryMock.findOneBy).toHaveBeenCalledExactlyOnceWith({
          id: 102,
          serviceRequestId: 42,
        });
        expect(messageRepositoryMock.update).toHaveBeenCalledExactlyOnceWith(
          {
            serviceRequestId: 42,
            authorUserId: Not(userId),
            readAt: IsNull(),
            id: LessThanOrEqual(102),
          },
          { readAt: expect.any(Date) },
        );
        const appliedDate = messageRepositoryMock.update.mock.calls[0][1].readAt as Date;
        expect(appliedDate.getTime()).toBeGreaterThanOrEqual(startedAt);
        expect(appliedDate.getTime()).toBeLessThanOrEqual(Date.now());
        expect(boundary.readAt).toBeNull();
        expect(conversation.status).toBe(ServiceRequestStatus.ACCEPTED);
        expect(requestRepositoryMock.update).not.toHaveBeenCalled();
        expect(requestRepositoryMock.save).not.toHaveBeenCalled();
        expect(messageRepositoryMock.save).not.toHaveBeenCalled();
      },
    );

    it('should refuse an unrelated account before looking up the boundary or updating messages', async () => {
      await expect(service.markMessagesAsRead(42, dto, 99)).rejects.toThrow(
        new ForbiddenException('Only request participants can access this conversation'),
      );

      expect(messageRepositoryMock.findOneBy).not.toHaveBeenCalled();
      expect(messageRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('should refuse a missing request before looking up the boundary or updating messages', async () => {
      requestRepositoryMock.findOneBy.mockResolvedValue(null);

      await expect(service.markMessagesAsRead(42, dto, 8)).rejects.toThrow(
        new NotFoundException('Service request not found'),
      );

      expect(messageRepositoryMock.findOneBy).not.toHaveBeenCalled();
      expect(messageRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('should reject a missing boundary or one from another conversation using a scoped lookup', async () => {
      messageRepositoryMock.findOneBy.mockResolvedValue(null);

      await expect(service.markMessagesAsRead(42, dto, 8)).rejects.toThrow(
        new NotFoundException('Message not found in this conversation'),
      );

      expect(messageRepositoryMock.findOneBy).toHaveBeenCalledExactlyOnceWith({
        id: 102,
        serviceRequestId: 42,
      });
      expect(messageRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('should succeed when no unread received message matches the update conditions', async () => {
      messageRepositoryMock.update.mockResolvedValue({ affected: 0 });

      await expect(service.markMessagesAsRead(42, dto, 8)).resolves.toBeUndefined();

      expect(messageRepositoryMock.update).toHaveBeenCalledOnce();
    });

    it('should propagate a participation lookup failure without querying or updating messages', async () => {
      const error = new Error('Request lookup unavailable');
      requestRepositoryMock.findOneBy.mockRejectedValue(error);

      await expect(service.markMessagesAsRead(42, dto, 8)).rejects.toBe(error);

      expect(messageRepositoryMock.findOneBy).not.toHaveBeenCalled();
      expect(messageRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('should propagate a boundary lookup failure without updating messages', async () => {
      const error = new Error('Message lookup unavailable');
      messageRepositoryMock.findOneBy.mockRejectedValue(error);

      await expect(service.markMessagesAsRead(42, dto, 8)).rejects.toBe(error);

      expect(messageRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('should propagate an update failure instead of reporting success', async () => {
      const error = new Error('Message update unavailable');
      messageRepositoryMock.update.mockRejectedValue(error);

      await expect(service.markMessagesAsRead(42, dto, 8)).rejects.toBe(error);
    });

    it('should wait for participation to be checked before reading the boundary', async () => {
      let finishLookup!: (request: ServiceRequest) => void;
      requestRepositoryMock.findOneBy.mockReturnValue(
        new Promise<ServiceRequest>((resolve) => {
          finishLookup = resolve;
        }),
      );
      const response = service.markMessagesAsRead(42, dto, 8);
      expect(messageRepositoryMock.findOneBy).not.toHaveBeenCalled();
      expect(messageRepositoryMock.update).not.toHaveBeenCalled();

      finishLookup(conversation);
      await response;

      expect(messageRepositoryMock.findOneBy).toHaveBeenCalledOnce();
      expect(messageRepositoryMock.update).toHaveBeenCalledOnce();
    });

    it('should wait for the boundary lookup before updating messages', async () => {
      let finishLookup!: (message: ServiceRequestMessage) => void;
      messageRepositoryMock.findOneBy.mockReturnValue(
        new Promise<ServiceRequestMessage>((resolve) => {
          finishLookup = resolve;
        }),
      );
      const response = service.markMessagesAsRead(42, dto, 8);
      await Promise.resolve();
      await Promise.resolve();
      expect(messageRepositoryMock.findOneBy).toHaveBeenCalledOnce();
      expect(messageRepositoryMock.update).not.toHaveBeenCalled();

      finishLookup(boundary);
      await response;

      expect(messageRepositoryMock.update).toHaveBeenCalledOnce();
    });

    it('should resolve only after the conditional database update has completed', async () => {
      let finishUpdate!: (result: { affected: number }) => void;
      messageRepositoryMock.update.mockReturnValue(
        new Promise<{ affected: number }>((resolve) => {
          finishUpdate = resolve;
        }),
      );
      const settled = vi.fn();
      const response = service.markMessagesAsRead(42, dto, 8);
      void response.then(settled);
      for (let step = 0; step < 4; step++) await Promise.resolve();
      expect(messageRepositoryMock.update).toHaveBeenCalledOnce();
      expect(settled).not.toHaveBeenCalled();

      finishUpdate({ affected: 1 });
      await expect(response).resolves.toBeUndefined();

      expect(settled).toHaveBeenCalledOnce();
    });
  });

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
        hasReview: false,
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
        review: null,
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
          relations: { requesterUser: true, recipientUser: true, review: true },
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
