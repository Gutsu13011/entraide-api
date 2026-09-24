import { Test, TestingModule } from '@nestjs/testing';
import { ServiceOfferingsController } from './service-offerings.controller.js';
import { ServiceOfferingService } from './service-offering.service.js';
import { ServiceOffering } from './service-offering.entity.js';
import { ServicePricingType } from './service-pricing-type.enum.js';
import type { CreateServiceOfferingDto } from './dto/create-service-offering.dto.js';

describe('ServiceOfferingsController', () => {
  let controller: ServiceOfferingsController;
  const serviceOfferingServiceMock = {
    findAllForServiceProvider: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServiceOfferingsController],
      providers: [{ provide: ServiceOfferingService, useValue: serviceOfferingServiceMock }],
    }).compile();

    controller = module.get<ServiceOfferingsController>(ServiceOfferingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return service offerings for a service provider', async () => {
      const serviceProviderId = 1;
      const expectedServiceOfferings: ServiceOffering[] = [
        Object.assign(new ServiceOffering(), {
          id: 1,
          title: 'Réparation de fuite',
          description: 'Recherche et réparation des fuites dans votre logement.',
          pricingType: ServicePricingType.HOURLY,
          hourlyRate: 45,
          serviceProviderId,
        }),
      ];

      serviceOfferingServiceMock.findAllForServiceProvider.mockResolvedValue(
        expectedServiceOfferings,
      );

      const result = await controller.findAll(serviceProviderId);

      expect(serviceOfferingServiceMock.findAllForServiceProvider).toHaveBeenCalledWith(
        serviceProviderId,
      );
      expect(result).toBe(expectedServiceOfferings);
    });
  });

  describe('create', () => {
    it('should create a service offering for a service provider', async () => {
      const serviceProviderId = 1;
      const serviceOfferingMock: CreateServiceOfferingDto = {
        title: 'titre1',
        description: 'descr1',
        pricingType: ServicePricingType.HOURLY,
        hourlyRate: 45,
      };
      const expectedServiceOffering: ServiceOffering = Object.assign(new ServiceOffering(), {
        id: 1,
        ...serviceOfferingMock,
        serviceProviderId,
      });

      serviceOfferingServiceMock.create.mockResolvedValue(expectedServiceOffering);

      const result = await controller.create(serviceProviderId, serviceOfferingMock);

      expect(serviceOfferingServiceMock.create).toHaveBeenCalledWith(
        serviceProviderId,
        serviceOfferingMock,
      );
      expect(result).toBe(expectedServiceOffering);
    });
  });
});
