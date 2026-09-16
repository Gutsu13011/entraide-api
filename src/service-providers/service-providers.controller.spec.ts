import { Test, TestingModule } from '@nestjs/testing';
import { ServiceProvidersController } from './service-providers.controller.js';
import { ServiceProvidersService } from './service-providers.service.js';
import type { ServiceProvider } from './service-provider.entity.js';
import type { CreateServiceProviderDto } from './dto/create-service-provider.dto.js';
import type { UpdateServiceProviderDto } from './dto/update-service-provider.dto.js';
import type { PaginatedServiceProvidersDto } from './dto/paginated-service-providers.dto.js';
import type { QueryServiceProvidersDto } from './dto/query-service-providers.dto.js';

describe('ServiceProvidersController', () => {
  let controller: ServiceProvidersController;
  let service: ServiceProvidersService;
  const serviceMock = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServiceProvidersController],
      providers: [
        {
          provide: ServiceProvidersService,
          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get<ServiceProvidersController>(ServiceProvidersController);
    service = module.get<ServiceProvidersService>(ServiceProvidersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return the result provided by the service', async () => {
      const queryServiceProvidersDto: QueryServiceProvidersDto = {
        page: 2,
        limit: 10,
        sortOrder: 'ASC',
        sortBy: 'id',
      };
      const expectedResponse: PaginatedServiceProvidersDto = {
        data: [],
        total: 12,
        page: 2,
        limit: 10,
        totalPages: 2,
      };
      const findAllSpy = vi.spyOn(service, 'findAll').mockResolvedValue(expectedResponse);

      const result = await controller.findAll(queryServiceProvidersDto);

      expect(findAllSpy).toHaveBeenCalledWith(queryServiceProvidersDto);
      expect(result).toBe(expectedResponse);
    });
  });

  describe('findOne', () => {
    it('should pass the id to the service and return its result', async () => {
      const expectedServiceProvider: ServiceProvider = {
        id: 2,
        firstName: 'Thomas',
        lastName: 'Bernard',
        profession: 'Électricien',
        city: 'Lyon',
        description: 'Test',
        hourlyRate: 40,
        available: true,
        imageUrl: '',
      };
      serviceMock.findOne.mockResolvedValue(expectedServiceProvider);

      const result = await controller.findOne(2);

      expect(serviceMock.findOne).toHaveBeenCalledWith(2);
      expect(result).toEqual(expectedServiceProvider);
    });
  });

  describe('create', () => {
    it('should pass the DTO to the service and return the created provider', async () => {
      const createServiceProviderDto: CreateServiceProviderDto = {
        firstName: 'Julie',
        lastName: 'Durand',
        profession: 'Peintre',
        city: 'Marseille',
        description: 'Peinture intérieure et extérieure',
        hourlyRate: 35,
        available: true,
        imageUrl: '',
      };
      const expectedServiceProvider: ServiceProvider = {
        id: 3,
        ...createServiceProviderDto,
      };
      const createSpy = vi.spyOn(service, 'create').mockResolvedValue(expectedServiceProvider);

      const result = await controller.create(createServiceProviderDto);

      expect(createSpy).toHaveBeenCalledWith(createServiceProviderDto);
      expect(result).toBe(expectedServiceProvider);
    });
  });

  describe('update', () => {
    it('should pass the id and DTO to the service and return its result', async () => {
      const updateServiceProviderDto: UpdateServiceProviderDto = {
        city: 'Nice',
        available: false,
      };
      const expectedServiceProvider: ServiceProvider = {
        id: 1,
        firstName: 'Sophie',
        lastName: 'Martin',
        profession: 'Plombière',
        description: 'Test',
        hourlyRate: 40,
        imageUrl: '',
        city: 'Nice',
        available: false,
      };
      const updateSpy = vi.spyOn(service, 'update').mockResolvedValue(expectedServiceProvider);

      const result = await controller.update(1, updateServiceProviderDto);

      expect(updateSpy).toHaveBeenCalledWith(1, updateServiceProviderDto);
      expect(result).toBe(expectedServiceProvider);
    });
  });

  describe('remove', () => {
    it('should pass the id to the service and return undefined', async () => {
      serviceMock.remove.mockResolvedValue(undefined);

      const result = await controller.remove(1);

      expect(serviceMock.remove).toHaveBeenCalledWith(1);
      expect(result).toBeUndefined();
    });
  });
});
