import { Test, TestingModule } from '@nestjs/testing';
import { ServiceOfferingService } from './service-offering.service.js';
import { ServiceOffering } from './service-offering.entity.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ServiceProvidersService } from '../service-providers/service-providers.service.js';
import { CreateServiceOfferingDto } from './dto/create-service-offering.dto.js';
import { ServicePricingType } from './service-pricing-type.enum.js';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ServiceOfferingService', () => {
  let service: ServiceOfferingService;
  const repositoryMock = {
    create: vi.fn(),
    save: vi.fn(),
    find: vi.fn(),
  };
  const serviceProvidersServiceMock = {
    findOne: vi.fn(),
    findOneOwnedByOrFail: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    serviceProvidersServiceMock.findOneOwnedByOrFail.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceOfferingService,
        { provide: getRepositoryToken(ServiceOffering), useValue: repositoryMock },
        {
          provide: ServiceProvidersService,
          useValue: serviceProvidersServiceMock,
        },
      ],
    }).compile();

    service = module.get<ServiceOfferingService>(ServiceOfferingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create and save an hourly service offering', async () => {
    const serviceProviderId = 1;
    const createServiceOfferingDto: CreateServiceOfferingDto = {
      title: 'Hello',
      description: 'Je suis une description',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 45,
    };
    const expectedServiceOffering = { id: 1, ...createServiceOfferingDto, serviceProviderId };
    const userId = 7;

    serviceProvidersServiceMock.findOneOwnedByOrFail.mockResolvedValue({
      id: serviceProviderId,
      ownerUserId: userId,
    });
    repositoryMock.create.mockReturnValue(expectedServiceOffering);
    repositoryMock.save.mockResolvedValue(expectedServiceOffering);

    const result = await service.create(serviceProviderId, createServiceOfferingDto, userId);

    expect(serviceProvidersServiceMock.findOneOwnedByOrFail).toHaveBeenCalledWith(
      serviceProviderId,
      userId,
    );
    expect(repositoryMock.create).toHaveBeenCalledWith({
      serviceProviderId,
      ...createServiceOfferingDto,
      hourlyRate: 45,
    });
    expect(repositoryMock.save).toHaveBeenCalledWith(expectedServiceOffering);
    expect(result).toBe(expectedServiceOffering);
  });

  it('should create a free service offering with a null hourly rate', async () => {
    const serviceProviderId = 1;
    const createServiceOfferingDto: CreateServiceOfferingDto = {
      title: 'Hello',
      description: 'Je suis une description',
      pricingType: ServicePricingType.FREE,
    };
    const expectedServiceOffering = {
      id: 1,
      ...createServiceOfferingDto,
      serviceProviderId,
      hourlyRate: null,
    };
    const userId = 7;

    serviceProvidersServiceMock.findOneOwnedByOrFail.mockResolvedValue({
      id: serviceProviderId,
      ownerUserId: userId,
    });
    repositoryMock.create.mockReturnValue(expectedServiceOffering);
    repositoryMock.save.mockResolvedValue(expectedServiceOffering);

    const result = await service.create(serviceProviderId, createServiceOfferingDto, userId);

    expect(serviceProvidersServiceMock.findOneOwnedByOrFail).toHaveBeenCalledWith(
      serviceProviderId,
      userId,
    );
    expect(repositoryMock.create).toHaveBeenCalledWith({
      serviceProviderId,
      ...createServiceOfferingDto,
      hourlyRate: null,
    });
    expect(repositoryMock.save).toHaveBeenCalledWith(expectedServiceOffering);
    expect(result).toBe(expectedServiceOffering);
  });

  it('should reject a free service offering with an hourly rate', async () => {
    const serviceProviderId = 1;
    const createServiceOfferingDto: CreateServiceOfferingDto = {
      title: 'Hello',
      description: 'Je suis une description',
      pricingType: ServicePricingType.FREE,
      hourlyRate: 20,
    };
    const error = new BadRequestException('A free service offering cannot have an hourly rate');
    const userId = 7;

    serviceProvidersServiceMock.findOneOwnedByOrFail.mockResolvedValue({
      id: serviceProviderId,
      ownerUserId: userId,
    });

    await expect(
      service.create(serviceProviderId, createServiceOfferingDto, userId),
    ).rejects.toStrictEqual(error);

    expect(serviceProvidersServiceMock.findOneOwnedByOrFail).toHaveBeenCalledWith(
      serviceProviderId,
      userId,
    );
    expect(repositoryMock.create).not.toHaveBeenCalled();
    expect(repositoryMock.save).not.toHaveBeenCalled();
  });

  it('should reject an hourly service offering without an hourly rate', async () => {
    const serviceProviderId = 1;
    const createServiceOfferingDto: CreateServiceOfferingDto = {
      title: 'Hello',
      description: 'Je suis une description',
      pricingType: ServicePricingType.HOURLY,
    };
    const error = new BadRequestException('An hourly service offering requires an hourly rate');
    const userId = 7;

    serviceProvidersServiceMock.findOneOwnedByOrFail.mockResolvedValue({
      id: serviceProviderId,
      ownerUserId: userId,
    });

    await expect(
      service.create(serviceProviderId, createServiceOfferingDto, userId),
    ).rejects.toStrictEqual(error);

    expect(serviceProvidersServiceMock.findOneOwnedByOrFail).toHaveBeenCalledWith(
      serviceProviderId,
      userId,
    );
    expect(repositoryMock.create).not.toHaveBeenCalled();
    expect(repositoryMock.save).not.toHaveBeenCalled();
  });

  it('should reject creating an offering when the user does not own the provider', async () => {
    const serviceProviderId = 1;
    const createServiceOfferingDto: CreateServiceOfferingDto = {
      title: 'Hello',
      description: 'Je suis une description',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 45,
    };
    const error = new ForbiddenException('You do not own this service provider profile');
    const userId = 8;

    serviceProvidersServiceMock.findOneOwnedByOrFail.mockRejectedValue(error);
    await expect(service.create(serviceProviderId, createServiceOfferingDto, userId)).rejects.toBe(
      error,
    );
    expect(serviceProvidersServiceMock.findOneOwnedByOrFail).toHaveBeenCalledWith(
      serviceProviderId,
      userId,
    );
    expect(repositoryMock.create).not.toHaveBeenCalled();
    expect(repositoryMock.save).not.toHaveBeenCalled();
  });

  it('should return service offerings for an existing service provider', async () => {
    const serviceProviderId = 1;
    const serviceOfferingArray = [
      {
        id: 1,
        title: 'titre1',
        description: 'descr1',
        pricingType: ServicePricingType.FREE,
        hourlyRate: null,
        serviceProviderId,
      },
      {
        id: 2,
        title: 'titre2',
        description: 'descr2',
        pricingType: ServicePricingType.HOURLY,
        hourlyRate: 10,
        serviceProviderId,
      },
    ];

    serviceProvidersServiceMock.findOne.mockResolvedValue({ id: serviceProviderId });
    repositoryMock.find.mockResolvedValue(serviceOfferingArray);

    const result = await service.findAllForServiceProvider(serviceProviderId);

    expect(serviceProvidersServiceMock.findOne).toHaveBeenCalledWith(serviceProviderId);
    expect(repositoryMock.find).toHaveBeenCalledWith({
      where: { serviceProviderId },
      order: { id: 'ASC' },
    });
    expect(result).toBe(serviceOfferingArray);
  });

  it('should not query service offerings when the service provider does not exist', async () => {
    const serviceProviderId = 999;
    const error = new NotFoundException(`Service provider with id ${serviceProviderId} not found`);

    serviceProvidersServiceMock.findOne.mockRejectedValue(error);

    await expect(service.findAllForServiceProvider(serviceProviderId)).rejects.toBe(error);
    expect(repositoryMock.find).not.toHaveBeenCalled();
  });
});
