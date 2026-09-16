import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ServiceProvidersService } from './service-providers.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ServiceProvider } from './service-provider.entity.js';
import { Like } from 'typeorm';

describe('ServiceProvidersService', () => {
  let service: ServiceProvidersService;
  const repositoryMock = {
    findAndCount: vi.fn(),
    findOneBy: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceProvidersService,
        {
          provide: getRepositoryToken(ServiceProvider),
          useValue: repositoryMock,
        },
      ],
    }).compile();

    service = module.get<ServiceProvidersService>(ServiceProvidersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return a page of service providers from the repository', async () => {
      const queryServiceProvidersDto = {
        page: 2,
        limit: 10,
        sortOrder: 'ASC' as const,
        sortBy: 'id' as const,
      };
      const expectedServiceProviders: ServiceProvider[] = [];
      repositoryMock.findAndCount.mockResolvedValue([expectedServiceProviders, 12]);

      const serviceProviders = await service.findAll(queryServiceProvidersDto);

      expect(repositoryMock.findAndCount).toHaveBeenCalledWith({
        where: {},
        skip: 10,
        take: 10,
        order: { id: 'ASC' },
      });
      expect(serviceProviders).toEqual({
        data: expectedServiceProviders,
        total: 12,
        page: 2,
        limit: 10,
        totalPages: 2,
      });
    });

    it('should filter service providers by city', async () => {
      const queryServiceProvidersDto = {
        page: 1,
        limit: 10,
        city: 'Paris',
        sortOrder: 'ASC' as const,
        sortBy: 'id' as const,
      };
      repositoryMock.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(queryServiceProvidersDto);

      expect(repositoryMock.findAndCount).toHaveBeenCalledWith({
        where: { city: 'Paris' },
        skip: 0,
        take: 10,
        order: { id: 'ASC' },
      });
    });

    it('should filter service providers by availability', async () => {
      const queryServiceProvidersDto = {
        page: 1,
        limit: 10,
        available: false,
        sortOrder: 'ASC' as const,
        sortBy: 'id' as const,
      };
      repositoryMock.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(queryServiceProvidersDto);

      expect(repositoryMock.findAndCount).toHaveBeenCalledWith({
        where: { available: false },
        skip: 0,
        take: 10,
        order: { id: 'ASC' },
      });
    });

    it('should sort service providers by hourly rate in descending order', async () => {
      repositoryMock.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        page: 1,
        limit: 10,
        sortBy: 'hourlyRate',
        sortOrder: 'DESC',
      });

      expect(repositoryMock.findAndCount).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 10,
        order: { hourlyRate: 'DESC' },
      });
    });

    it('should search service providers across text fields', async () => {
      repositoryMock.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        page: 1,
        limit: 10,
        city: 'Paris',
        sortBy: 'id',
        sortOrder: 'ASC',
        search: 'plomb',
      });

      expect(repositoryMock.findAndCount).toHaveBeenCalledWith({
        where: [
          {
            city: 'Paris',
            firstName: Like('%plomb%'),
          },
          {
            city: 'Paris',
            lastName: Like('%plomb%'),
          },
          {
            city: 'Paris',
            profession: Like('%plomb%'),
          },
          {
            city: 'Paris',
            description: Like('%plomb%'),
          },
        ],
        skip: 0,
        take: 10,
        order: { id: 'ASC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return the service provider matching the id', async () => {
      const existingServiceProvider: ServiceProvider = {
        id: 1,
        firstName: 'Sophie',
        lastName: 'Martin',
        profession: 'Plombière',
        city: 'Paris',
        description: 'Test',
        hourlyRate: 40,
        available: true,
        imageUrl: '',
      };
      repositoryMock.findOneBy.mockResolvedValue(existingServiceProvider);
      const result = await service.findOne(1);

      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(result).toEqual(existingServiceProvider);
    });

    it('should throw a NotFoundException when the id does not exist', async () => {
      repositoryMock.findOneBy.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: 999 });
    });
  });

  describe('create', () => {
    it('should create and save a service provider', async () => {
      const createServiceProviderDto = {
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

      repositoryMock.create.mockReturnValue(expectedServiceProvider);
      repositoryMock.save.mockResolvedValue(expectedServiceProvider);

      const createdServiceProvider = await service.create(createServiceProviderDto);

      expect(repositoryMock.create).toHaveBeenCalledWith(createServiceProviderDto);
      expect(repositoryMock.save).toHaveBeenCalledWith(expectedServiceProvider);
      expect(createdServiceProvider).toBe(expectedServiceProvider);
    });
  });

  describe('update', () => {
    it('should update and save the service provider', async () => {
      const existingServiceProvider: ServiceProvider = {
        id: 1,
        firstName: 'Sophie',
        lastName: 'Martin',
        profession: 'Plombière',
        city: 'Paris',
        description: 'Test',
        hourlyRate: 40,
        available: true,
        imageUrl: '',
      };
      const updateServiceProviderDto = {
        city: 'Aix-en-Provence',
        available: false,
      };

      repositoryMock.findOneBy.mockResolvedValue(existingServiceProvider);
      repositoryMock.save.mockResolvedValue(existingServiceProvider);

      const updatedServiceProvider = await service.update(1, updateServiceProviderDto);

      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(repositoryMock.save).toHaveBeenCalledWith(existingServiceProvider);
      expect(updatedServiceProvider).toBe(existingServiceProvider);
      expect(updatedServiceProvider).toMatchObject(updateServiceProviderDto);
    });

    it('should throw a NotFoundException when the id does not exist', async () => {
      repositoryMock.findOneBy.mockResolvedValue(null);

      await expect(service.update(999, { city: 'Paris' })).rejects.toThrow(NotFoundException);

      expect(repositoryMock.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove the service provider', async () => {
      const existingServiceProvider: ServiceProvider = {
        id: 1,
        firstName: 'Sophie',
        lastName: 'Martin',
        profession: 'Plombière',
        city: 'Paris',
        description: 'Test',
        hourlyRate: 40,
        available: true,
        imageUrl: '',
      };
      repositoryMock.findOneBy.mockResolvedValue(existingServiceProvider);
      repositoryMock.remove.mockResolvedValue(existingServiceProvider);

      await service.remove(1);

      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(repositoryMock.remove).toHaveBeenCalledWith(existingServiceProvider);
    });

    it('should throw a NotFoundException when the id does not exist', async () => {
      repositoryMock.findOneBy.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(repositoryMock.remove).not.toHaveBeenCalled();
    });
  });
});
