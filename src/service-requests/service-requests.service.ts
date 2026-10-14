import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ServiceRequest } from './service-request.entity.js';
import { Repository } from 'typeorm';
import { ServiceOffering } from '../service-offerings/service-offering.entity.js';
import { ServiceProvidersService } from '../service-providers/service-providers.service.js';
import { CreateServiceRequestDto } from './dto/create-service-request.dto.js';
import { ServiceRequestResponseDto } from './dto/service-request-response.dto.js';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto.js';
import { ServiceRequestStatus } from './service-request-status.enum.js';

@Injectable()
export class ServiceRequestsService {
  constructor(
    @InjectRepository(ServiceRequest)
    private readonly serviceRequestsRepository: Repository<ServiceRequest>,
    @InjectRepository(ServiceOffering)
    private readonly serviceOfferingsRepository: Repository<ServiceOffering>,
    private readonly serviceProvidersService: ServiceProvidersService,
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
      offeringTitleSnapshot: serviceOffering.title,
      offeringPricingTypeSnapshot: serviceOffering.pricingType,
      offeringHourlyRateSnapshot: serviceOffering.hourlyRate,
    });

    const savedRequest = await this.serviceRequestsRepository.save(serviceRequest);
    const requestWithParticipants = await this.serviceRequestsRepository.findOneOrFail({
      where: { id: savedRequest.id },
      relations: { requesterUser: true, recipientUser: true },
    });

    return this.toResponse(requestWithParticipants);
  }

  async findSentByUser(userId: number): Promise<ServiceRequestResponseDto[]> {
    const requests = await this.serviceRequestsRepository.find({
      where: { requesterUserId: userId },
      relations: { requesterUser: true, recipientUser: true },
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return requests.map((serviceRequest) => this.toResponse(serviceRequest));
  }

  async findReceivedByUser(userId: number): Promise<ServiceRequestResponseDto[]> {
    const requests = await this.serviceRequestsRepository.find({
      where: { recipientUserId: userId },
      relations: { requesterUser: true, recipientUser: true },
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return requests.map((serviceRequest) => this.toResponse(serviceRequest));
  }

  async updateStatus(
    id: number,
    updateServiceRequestStatusDto: UpdateServiceRequestStatusDto,
    userId: number,
  ): Promise<ServiceRequestResponseDto> {
    const serviceRequest = await this.serviceRequestsRepository.findOne({
      where: { id },
      relations: { requesterUser: true, recipientUser: true },
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
      [ServiceRequestStatus.ACCEPTED]: [],
      [ServiceRequestStatus.REJECTED]: [],
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

  private toResponse(serviceRequest: ServiceRequest): ServiceRequestResponseDto {
    return {
      id: serviceRequest.id,
      message: serviceRequest.message,
      status: serviceRequest.status,
      createdAt: serviceRequest.createdAt,
      requesterUserId: serviceRequest.requesterUserId,
      recipientUserId: serviceRequest.recipientUserId,
      serviceOfferingId: serviceRequest.serviceOfferingId,
      offeringTitleSnapshot: serviceRequest.offeringTitleSnapshot,
      offeringPricingTypeSnapshot: serviceRequest.offeringPricingTypeSnapshot,
      offeringHourlyRateSnapshot: serviceRequest.offeringHourlyRateSnapshot,
      requester: {
        id: serviceRequest.requesterUser.id,
        firstName: serviceRequest.requesterUser.firstName,
        lastName: serviceRequest.requesterUser.lastName,
      },
      recipient: {
        id: serviceRequest.recipientUser.id,
        firstName: serviceRequest.recipientUser.firstName,
        lastName: serviceRequest.recipientUser.lastName,
      },
    };
  }
}
