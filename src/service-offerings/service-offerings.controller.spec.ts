import { Test, TestingModule } from '@nestjs/testing';
import { ServiceOfferingsController } from './service-offerings.controller.js';
import { ServiceOfferingService } from './service-offering.service.js';
import { ServiceOffering } from './service-offering.entity.js';
import { ServicePricingType } from './service-pricing-type.enum.js';
import type { CreateServiceOfferingDto } from './dto/create-service-offering.dto.js';
import type { UpdateServiceOfferingDto } from './dto/update-service-offering.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { Request } from 'express';

describe('ServiceOfferingsController', () => {
  let controller: ServiceOfferingsController;
  const serviceOfferingServiceMock = {
    findAllForServiceProvider: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    serviceOfferingServiceMock.remove.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServiceOfferingsController],
      providers: [{ provide: ServiceOfferingService, useValue: serviceOfferingServiceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

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
    it('should pass the provider id, DTO and authenticated user id to the service and return its result', async () => {
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
      const requestMock = { user: { id: 7 } } as Request & { user: { id: number } };

      serviceOfferingServiceMock.create.mockResolvedValue(expectedServiceOffering);

      const result = await controller.create(serviceProviderId, serviceOfferingMock, requestMock);

      expect(serviceOfferingServiceMock.create).toHaveBeenCalledWith(
        serviceProviderId,
        serviceOfferingMock,
        requestMock.user.id,
      );
      expect(result).toBe(expectedServiceOffering);
    });
  });

  describe('remove', () => {
    it('should pass both route ids and the authenticated user id to the service', async () => {
      const requestMock = { user: { id: 7 } } as Request & { user: { id: number } };
      serviceOfferingServiceMock.remove.mockResolvedValue(undefined);

      const result = await controller.remove(1, 12, requestMock);

      expect(serviceOfferingServiceMock.remove).toHaveBeenCalledExactlyOnceWith(1, 12, 7);
      expect(result).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should pass both route ids, the partial DTO and authenticated user id to the service', async () => {
      const update: UpdateServiceOfferingDto = { title: 'Nouveau titre' };
      const expectedOffering = Object.assign(new ServiceOffering(), {
        id: 12,
        serviceProviderId: 1,
        ...update,
        description: 'Description existante',
        pricingType: ServicePricingType.HOURLY,
        hourlyRate: 35,
      });
      const requestMock = { user: { id: 7 } } as Request & { user: { id: number } };
      serviceOfferingServiceMock.update.mockResolvedValue(expectedOffering);

      const result = await controller.update(1, 12, update, requestMock);

      expect(serviceOfferingServiceMock.update).toHaveBeenCalledExactlyOnceWith(1, 12, update, 7);
      expect(result).toBe(expectedOffering);
    });
  });
});
