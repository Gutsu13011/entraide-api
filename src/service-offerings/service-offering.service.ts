import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ServiceOffering } from './service-offering.entity.js';
import { Repository } from 'typeorm';
import { ServiceProvidersService } from '../service-providers/service-providers.service.js';
import { CreateServiceOfferingDto } from './dto/create-service-offering.dto.js';
import { UpdateServiceOfferingDto } from './dto/update-service-offering.dto.js';
import { ServicePricingType } from './service-pricing-type.enum.js';

@Injectable()
export class ServiceOfferingService {
  constructor(
    @InjectRepository(ServiceOffering)
    private readonly serviceOfferingsRepository: Repository<ServiceOffering>,
    private readonly serviceProvidersService: ServiceProvidersService,
  ) {}

  private async findOneOrFail(serviceProviderId: number, id: number): Promise<ServiceOffering> {
    const serviceOffering = await this.serviceOfferingsRepository.findOneBy({
      id,
      serviceProviderId,
    });

    if (serviceOffering === null) {
      throw new NotFoundException('Service offering not found');
    }

    return serviceOffering;
  }

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
    userId: number,
  ): Promise<ServiceOffering> {
    await this.serviceProvidersService.findOneOwnedByOrFail(serviceProviderId, userId);

    const serviceOffering = this.serviceOfferingsRepository.create({
      ...createServiceOfferingDto,
      hourlyRate: this.getHourlyRate(createServiceOfferingDto),
      serviceProviderId,
    });

    return this.serviceOfferingsRepository.save(serviceOffering);
  }

  async update(
    serviceProviderId: number,
    id: number,
    updateServiceOfferingDto: UpdateServiceOfferingDto,
    userId: number,
  ): Promise<ServiceOffering> {
    await this.serviceProvidersService.findOneOwnedByOrFail(serviceProviderId, userId);

    const serviceOffering = await this.findOneOrFail(serviceProviderId, id);
    const updateOffering = {
      ...serviceOffering,
      ...updateServiceOfferingDto,
    };

    if (
      updateOffering.pricingType === ServicePricingType.FREE &&
      updateServiceOfferingDto.hourlyRate === undefined
    ) {
      updateOffering.hourlyRate = null;
    }
    updateOffering.hourlyRate = this.getHourlyRate(updateOffering);

    return this.serviceOfferingsRepository.save(updateOffering);
  }

  async findAllForServiceProvider(serviceProviderId: number): Promise<ServiceOffering[]> {
    await this.serviceProvidersService.findOne(serviceProviderId);

    return this.serviceOfferingsRepository.find({
      where: { serviceProviderId },
      order: { id: 'ASC' },
    });
  }
}
