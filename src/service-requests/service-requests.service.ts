import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ServiceRequest } from './service-request.entity.js';
import { Repository } from 'typeorm';
import { ServiceOffering } from '../service-offerings/service-offering.entity.js';
import { ServiceProvidersService } from '../service-providers/service-providers.service.js';
import { CreateServiceRequestDto } from './dto/create-service-request.dto.js';

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
  ): Promise<ServiceRequest> {
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

    return this.serviceRequestsRepository.save(serviceRequest);
  }

  async findSentByUser(userId: number): Promise<ServiceRequest[]> {
    return this.serviceRequestsRepository.find({
      where: { requesterUserId: userId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  async findReceivedByUser(userId: number): Promise<ServiceRequest[]> {
    return this.serviceRequestsRepository.find({
      where: { recipientUserId: userId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }
}
