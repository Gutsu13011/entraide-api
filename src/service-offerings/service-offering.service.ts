import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ServiceOffering } from './service-offering.entity.js';
import { Repository } from 'typeorm';
import { ServiceProvidersService } from '../service-providers/service-providers.service.js';
import { CreateServiceOfferingDto } from './dto/create-service-offering.dto.js';
import { ServicePricingType } from './service-pricing-type.enum.js';

@Injectable()
export class ServiceOfferingService {
  constructor(
    @InjectRepository(ServiceOffering)
    private readonly serviceOfferingsRepository: Repository<ServiceOffering>,
    private readonly serviceProvidersService: ServiceProvidersService,
  ) {}

  private getHourlyRate(createServiceOfferingDto: CreateServiceOfferingDto): number | null {
    const { pricingType, hourlyRate } = createServiceOfferingDto;

    if (pricingType === ServicePricingType.FREE) {
      if (hourlyRate !== undefined && hourlyRate !== null) {
        throw new BadRequestException('A free service offering cannot have an hourly rate');
      }
      return null;
    }

    if (hourlyRate === undefined || hourlyRate === null) {
      throw new BadRequestException('An hourly service offering requires an hourly rate');
    }

    return hourlyRate;
  }

  async create(
    serviceProviderId: number,
    createServiceOfferingDto: CreateServiceOfferingDto,
  ): Promise<ServiceOffering> {
    await this.serviceProvidersService.findOne(serviceProviderId);

    const serviceOffering = this.serviceOfferingsRepository.create({
      ...createServiceOfferingDto,
      hourlyRate: this.getHourlyRate(createServiceOfferingDto),
      serviceProviderId,
    });

    return this.serviceOfferingsRepository.save(serviceOffering);
  }

  async findAllForServiceProvider(serviceProviderId: number): Promise<ServiceOffering[]> {
    await this.serviceProvidersService.findOne(serviceProviderId);

    return this.serviceOfferingsRepository.find({
      where: { serviceProviderId },
      order: { id: 'ASC' },
    });
  }
}
