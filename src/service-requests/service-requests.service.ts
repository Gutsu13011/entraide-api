import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ServiceRequest } from './service-request.entity.js';
import { IsNull, LessThanOrEqual, Not, Repository, type FindOptionsWhere } from 'typeorm';
import { ServiceOffering } from '../service-offerings/service-offering.entity.js';
import { ServiceProvidersService } from '../service-providers/service-providers.service.js';
import { CreateServiceRequestDto } from './dto/create-service-request.dto.js';
import { ServiceRequestResponseDto } from './dto/service-request-response.dto.js';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto.js';
import { ServiceRequestStatus } from './service-request-status.enum.js';
import { ServiceRequestMessage } from './service-request-message.entity.js';
import { ServiceRequestMessageResponseDto } from './dto/service-request-message-response.dto.js';
import { CreateServiceRequestMessageDto } from './dto/create-service-request-message.dto.js';
import { MarkServiceRequestMessagesReadDto } from './dto/mark-service-request-messages-read.dto.js';
import { ServiceRequestUnreadMessageCountsDto } from './dto/service-request-unread-message-counts.dto.js';
import { ServiceRequestMessageReminder } from './service-request-message-reminder.entity.js';
import { ServiceRequestMessageReminderStatus } from './service-request-message-reminder-status.enum.js';
import { ServiceRequestMessagesGateway } from './service-request-messages.gateway.js';
import { MESSAGE_REMINDER_DELAY_MS } from './service-request-message-reminder.config.js';
import type { User } from '../users/user.entity.js';
import type { ServiceRequestParticipantDto } from './dto/service-request-participant.dto.js';

@Injectable()
export class ServiceRequestsService {
  constructor(
    @InjectRepository(ServiceRequest)
    private readonly serviceRequestsRepository: Repository<ServiceRequest>,
    @InjectRepository(ServiceOffering)
    private readonly serviceOfferingsRepository: Repository<ServiceOffering>,
    private readonly serviceProvidersService: ServiceProvidersService,
    @InjectRepository(ServiceRequestMessage)
    private readonly serviceRequestMessageRepository: Repository<ServiceRequestMessage>,
    private readonly serviceRequestMessageGateway: ServiceRequestMessagesGateway,
  ) {}

  async create(
    serviceProviderId: number,
    serviceOfferingId: number,
    createServiceRequestDto: CreateServiceRequestDto,
    requesterUserId: number,
  ): Promise<ServiceRequestResponseDto> {
    const serviceProvider = await this.serviceProvidersService.findOne(serviceProviderId);
    const serviceOffering = await this.serviceOfferingsRepository.findOneBy({
      id: serviceOfferingId,
      serviceProviderId,
    });

    if (serviceOffering === null) {
      throw new NotFoundException('Service offering not found');
    }
    if (serviceProvider.ownerUserId === null) {
      throw new ConflictException('This service provider profile has no owner');
    }

    const serviceRequest = this.serviceRequestsRepository.create({
      message: createServiceRequestDto.message,
      requesterUserId: requesterUserId,
      recipientUserId: serviceProvider.ownerUserId,
      serviceOfferingId: serviceOffering.id,
      serviceProviderId: serviceProvider.id,
      offeringTitleSnapshot: serviceOffering.title,
      offeringPricingTypeSnapshot: serviceOffering.pricingType,
      offeringHourlyRateSnapshot: serviceOffering.hourlyRate,
    });

    const savedRequest = await this.serviceRequestsRepository.save(serviceRequest);
    const requestWithParticipants = await this.serviceRequestsRepository.findOneOrFail({
      where: { id: savedRequest.id },
      relations: { requesterUser: true, recipientUser: true, review: true },
    });

    return this.toResponse(requestWithParticipants);
  }

  async findSentByUser(userId: number): Promise<ServiceRequestResponseDto[]> {
    return this.findRequests({ requesterUserId: userId });
  }

  async findReceivedByUser(userId: number): Promise<ServiceRequestResponseDto[]> {
    return this.findRequests({ recipientUserId: userId });
  }

  async updateStatus(
    id: number,
    updateServiceRequestStatusDto: UpdateServiceRequestStatusDto,
    userId: number,
  ): Promise<ServiceRequestResponseDto> {
    const serviceRequest = await this.serviceRequestsRepository.findOne({
      where: { id },
      relations: { requesterUser: true, recipientUser: true, review: true },
    });

    if (serviceRequest === null) {
      throw new NotFoundException('Service request not found');
    }

    if (serviceRequest.recipientUserId !== userId) {
      throw new ForbiddenException('Only the recipient can update this request');
    }

    const allowedTransitions: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
      [ServiceRequestStatus.SENT]: [
        ServiceRequestStatus.READ,
        ServiceRequestStatus.REJECTED,
        ServiceRequestStatus.ACCEPTED,
      ],
      [ServiceRequestStatus.READ]: [ServiceRequestStatus.ACCEPTED, ServiceRequestStatus.REJECTED],
      [ServiceRequestStatus.ACCEPTED]: [ServiceRequestStatus.COMPLETED],
      [ServiceRequestStatus.REJECTED]: [],
      [ServiceRequestStatus.COMPLETED]: [],
    };
    const nextStatus = updateServiceRequestStatusDto.status;
    const allowedStatus = allowedTransitions[serviceRequest.status] ?? [];

    if (!allowedStatus.includes(nextStatus)) {
      throw new ConflictException('This status transition is not allowed');
    }

    const result = await this.serviceRequestsRepository.update(
      { id: serviceRequest.id, recipientUserId: userId, status: serviceRequest.status },
      { status: nextStatus },
    );

    if (result.affected !== 1) {
      throw new ConflictException('Service request changed. Refresh and try again');
    }

    return this.toResponse({ ...serviceRequest, status: nextStatus });
  }

  async createMessage(
    serviceRequestId: number,
    createServiceRequestMessageDto: CreateServiceRequestMessageDto,
    userId: number,
  ): Promise<ServiceRequestMessageResponseDto> {
    const serviceRequest = await this.findRequestForParticipant(serviceRequestId, userId);

    const messageResponse = await this.serviceRequestMessageRepository.manager.transaction(
      async (manager) => {
        const messageRepository = manager.getRepository(ServiceRequestMessage);
        const messageToCreate = messageRepository.create({
          content: createServiceRequestMessageDto.content,
          serviceRequestId: serviceRequest.id,
          authorUserId: userId,
          readAt: null,
        });
        const savedMessage = await messageRepository.save(messageToCreate);
        const recipientUserId =
          userId === serviceRequest.requesterUserId
            ? serviceRequest.recipientUserId
            : serviceRequest.requesterUserId;
        const dueAt = new Date(savedMessage.createdAt.getTime() + MESSAGE_REMINDER_DELAY_MS);

        await manager
          .getRepository(ServiceRequestMessageReminder)
          .createQueryBuilder()
          .insert()
          .values({
            serviceRequestId: serviceRequest.id,
            recipientUserId,
            status: ServiceRequestMessageReminderStatus.PENDING,
            dueAt,
            sentAt: null,
          })
          .orIgnore()
          .updateEntity(false)
          .execute();

        const message = await messageRepository.findOneOrFail({
          where: { id: savedMessage.id },
          relations: { authorUser: true },
        });

        return this.toMessageResponse(message);
      },
    );

    this.serviceRequestMessageGateway.notifyConversationChanged(
      serviceRequest.id,
      serviceRequest.requesterUserId,
      serviceRequest.recipientUserId,
    );

    return messageResponse;
  }

  async findMessages(
    serviceRequestId: number,
    userId: number,
  ): Promise<ServiceRequestMessageResponseDto[]> {
    const serviceRequest = await this.findRequestForParticipant(serviceRequestId, userId);
    const messages = await this.serviceRequestMessageRepository.find({
      where: { serviceRequestId: serviceRequest.id },
      relations: { authorUser: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    return messages.map((message) => this.toMessageResponse(message));
  }

  async markMessagesAsRead(
    serviceRequestId: number,
    markServiceRequestMessagesReadDto: MarkServiceRequestMessagesReadDto,
    userId: number,
  ): Promise<void> {
    const serviceRequest = await this.findRequestForParticipant(serviceRequestId, userId);

    const hasReadChange = await this.serviceRequestMessageRepository.manager.transaction(
      async (manager) => {
        const messageRepository = manager.getRepository(ServiceRequestMessage);
        const message = await messageRepository.findOneBy({
          id: markServiceRequestMessagesReadDto.upToMessageId,
          serviceRequestId: serviceRequest.id,
        });

        if (message === null) {
          throw new NotFoundException('Message not found in this conversation');
        }

        const updateResult = await messageRepository.update(
          {
            serviceRequestId: serviceRequest.id,
            authorUserId: Not(userId),
            readAt: IsNull(),
            id: LessThanOrEqual(markServiceRequestMessagesReadDto.upToMessageId),
          },
          { readAt: new Date() },
        );
        const messagesWereUpdated = (updateResult.affected ?? 0) > 0;
        const hasUnreadMessages = await messageRepository.existsBy({
          serviceRequestId: serviceRequest.id,
          authorUserId: Not(userId),
          readAt: IsNull(),
        });

        if (hasUnreadMessages) {
          return messagesWereUpdated;
        }

        await manager.getRepository(ServiceRequestMessageReminder).update(
          {
            serviceRequestId: serviceRequest.id,
            recipientUserId: userId,
            status: ServiceRequestMessageReminderStatus.PENDING,
          },
          { status: ServiceRequestMessageReminderStatus.CANCELLED },
        );

        return messagesWereUpdated;
      },
    );

    if (hasReadChange) {
      this.serviceRequestMessageGateway.notifyConversationChanged(
        serviceRequestId,
        serviceRequest.requesterUserId,
        serviceRequest.recipientUserId,
      );
    }
  }

  async getUnreadMessageCounts(userId: number): Promise<ServiceRequestUnreadMessageCountsDto> {
    const sentRequests = await this.serviceRequestMessageRepository.count({
      where: {
        readAt: IsNull(),
        authorUserId: Not(userId),
        serviceRequest: { requesterUserId: userId },
      },
    });
    const receivedRequests = await this.serviceRequestMessageRepository.count({
      where: {
        readAt: IsNull(),
        authorUserId: Not(userId),
        serviceRequest: { recipientUserId: userId },
      },
    });

    return { sentRequests, receivedRequests, total: sentRequests + receivedRequests };
  }

  private async findRequestForParticipant(
    serviceRequestId: number,
    userId: number,
  ): Promise<ServiceRequest> {
    const serviceRequest = await this.serviceRequestsRepository.findOneBy({ id: serviceRequestId });

    if (serviceRequest === null) {
      throw new NotFoundException('Service request not found');
    }

    if (userId !== serviceRequest.requesterUserId && userId !== serviceRequest.recipientUserId) {
      throw new ForbiddenException('Only request participants can access this conversation');
    }

    return serviceRequest;
  }

  private toMessageResponse(message: ServiceRequestMessage): ServiceRequestMessageResponseDto {
    return {
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      readAt: message.readAt,
      serviceRequestId: message.serviceRequestId,
      authorUserId: message.authorUserId,
      author: this.toParticipantResponse(message.authorUser),
    };
  }

  private toResponse(serviceRequest: ServiceRequest): ServiceRequestResponseDto {
    return {
      id: serviceRequest.id,
      message: serviceRequest.message,
      status: serviceRequest.status,
      hasReview: Boolean(serviceRequest.review),
      createdAt: serviceRequest.createdAt,
      requesterUserId: serviceRequest.requesterUserId,
      recipientUserId: serviceRequest.recipientUserId,
      serviceOfferingId: serviceRequest.serviceOfferingId,
      serviceProviderId: serviceRequest.serviceProviderId,
      offeringTitleSnapshot: serviceRequest.offeringTitleSnapshot,
      offeringPricingTypeSnapshot: serviceRequest.offeringPricingTypeSnapshot,
      offeringHourlyRateSnapshot: serviceRequest.offeringHourlyRateSnapshot,
      requester: this.toParticipantResponse(serviceRequest.requesterUser),
      recipient: this.toParticipantResponse(serviceRequest.recipientUser),
    };
  }

  private toParticipantResponse(user: User): ServiceRequestParticipantDto {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  private async findRequests(
    where: FindOptionsWhere<ServiceRequest>,
  ): Promise<ServiceRequestResponseDto[]> {
    const requests = await this.serviceRequestsRepository.find({
      where,
      relations: {
        requesterUser: true,
        recipientUser: true,
        review: true,
      },
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return requests.map((serviceRequest) => this.toResponse(serviceRequest));
  }
}
