import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ServiceProvidersService } from './service-providers.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ServiceProvider } from './service-provider.entity.js';
import { Like } from 'typeorm';
import { UsersService } from '../users/users.service.js';

describe('ServiceProvidersService', () => {
  let service: ServiceProvidersService;

  const repositoryMock = {
    findAndCount: vi.fn(),
    findOneBy: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  };
  const usersServiceMock = {
    findById: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    repositoryMock.findOneBy.mockReset();
    usersServiceMock.findById.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceProvidersService,
        {
          provide: getRepositoryToken(ServiceProvider),
          useValue: repositoryMock,
        },
        { provide: UsersService, useValue: usersServiceMock },
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
        ownerUserId: null,
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
    const userMock = {
      id: 7,
      firstName: 'Alice',
      lastName: 'Martin',
    };

    it('should create a provider owned by the authenticated user using account names', async () => {
      const expectedServiceProvider: ServiceProvider = {
        id: 3,
        ...createServiceProviderDto,
        firstName: userMock.firstName,
        lastName: userMock.lastName,
        ownerUserId: userMock.id,
      };

      usersServiceMock.findById.mockResolvedValue(userMock);
      repositoryMock.findOneBy.mockResolvedValue(null);
      repositoryMock.create.mockReturnValue(expectedServiceProvider);
      repositoryMock.save.mockResolvedValue(expectedServiceProvider);

      const createdServiceProvider = await service.create(createServiceProviderDto, userMock.id);

      expect(usersServiceMock.findById).toHaveBeenCalledWith(userMock.id);
      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ ownerUserId: userMock.id });
      expect(repositoryMock.create).toHaveBeenCalledWith({
        ...createServiceProviderDto,
        ownerUserId: userMock.id,
        firstName: userMock.firstName,
        lastName: userMock.lastName,
      });
      expect(repositoryMock.save).toHaveBeenCalledWith(expectedServiceProvider);
      expect(createdServiceProvider).toBe(expectedServiceProvider);
    });

    it('should reject provider creation when the authenticated user no longer exists', async () => {
      usersServiceMock.findById.mockResolvedValue(null);

      await expect(service.create(createServiceProviderDto, 999)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersServiceMock.findById).toHaveBeenCalledWith(999);
      expect(repositoryMock.create).not.toHaveBeenCalled();
      expect(repositoryMock.save).not.toHaveBeenCalled();
    });

    it('should reject creation when the user already owns a provider', async () => {
      const serviceProviderUserMock = {
        id: 3,
        ...createServiceProviderDto,
        ownerUserId: userMock.id,
      };

      usersServiceMock.findById.mockResolvedValue(userMock);
      repositoryMock.findOneBy.mockResolvedValue(serviceProviderUserMock);
      await expect(service.create(createServiceProviderDto, userMock.id)).rejects.toThrow(
        ConflictException,
      );
      expect(usersServiceMock.findById).toHaveBeenCalledWith(userMock.id);
      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ ownerUserId: userMock.id });
      expect(repositoryMock.create).not.toHaveBeenCalled();
      expect(repositoryMock.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update and save the provider when the authenticated user owns it', async () => {
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
        ownerUserId: 7,
      };
      const updateServiceProviderDto = {
        city: 'Aix-en-Provence',
        available: false,
      };

      repositoryMock.findOneBy.mockResolvedValue(existingServiceProvider);
      repositoryMock.save.mockResolvedValue(existingServiceProvider);

      const updatedServiceProvider = await service.update(1, updateServiceProviderDto, 7);

      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(repositoryMock.save).toHaveBeenCalledWith(existingServiceProvider);
      expect(updatedServiceProvider).toBe(existingServiceProvider);
      expect(updatedServiceProvider).toMatchObject(updateServiceProviderDto);
    });

    it('should throw a NotFoundException when the id does not exist', async () => {
      repositoryMock.findOneBy.mockResolvedValue(null);

      await expect(service.update(999, { city: 'Paris' }, 7)).rejects.toThrow(NotFoundException);

      expect(repositoryMock.save).not.toHaveBeenCalled();
    });

    it("should reject updating another user's provider without modifying or saving it", async () => {
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
        ownerUserId: 7,
      };
      const updateServiceProviderDto = {
        city: 'Aix-en-Provence',
        available: false,
      };

      repositoryMock.findOneBy.mockResolvedValue(existingServiceProvider);
      await expect(
        service.update(existingServiceProvider.id, updateServiceProviderDto, 8),
      ).rejects.toThrow(ForbiddenException);
      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: existingServiceProvider.id });
      expect(repositoryMock.save).not.toHaveBeenCalled();
      expect(existingServiceProvider).toMatchObject({
        city: 'Paris',
        available: true,
      });
    });
  });

  describe('remove', () => {
    it('should remove the provider when the authenticated user owns it', async () => {
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
        ownerUserId: 7,
      };
      repositoryMock.findOneBy.mockResolvedValue(existingServiceProvider);
      repositoryMock.remove.mockResolvedValue(existingServiceProvider);

      await service.remove(existingServiceProvider.id, 7);

      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(repositoryMock.remove).toHaveBeenCalledWith(existingServiceProvider);
    });

    it('should throw a NotFoundException when the id does not exist', async () => {
      repositoryMock.findOneBy.mockResolvedValue(null);
      await expect(service.remove(999, 7)).rejects.toThrow(NotFoundException);
      expect(repositoryMock.remove).not.toHaveBeenCalled();
    });

    it("should reject removing another user's provider without deleting it", async () => {
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
        ownerUserId: 7,
      };
      repositoryMock.findOneBy.mockResolvedValue(existingServiceProvider);
      await expect(service.remove(existingServiceProvider.id, 8)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: existingServiceProvider.id });
      expect(repositoryMock.remove).not.toHaveBeenCalled();
    });
  });

  describe('findOneOwnedByOrFail', () => {
    const serviceProviderMock = {
      id: 3,
      firstName: 'Julie',
      lastName: 'Durand',
      profession: 'Peintre',
      city: 'Marseille',
      description: 'Peinture intérieure et extérieure',
      hourlyRate: 35,
      available: true,
      imageUrl: '',
      ownerUserId: 7,
    };

    it('should return the provider when the authenticated user owns it', async () => {
      repositoryMock.findOneBy.mockResolvedValue(serviceProviderMock);

      const serviceProviderExisting = await service.findOneOwnedByOrFail(
        serviceProviderMock.id,
        serviceProviderMock.ownerUserId,
      );

      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: serviceProviderMock.id });
      expect(serviceProviderExisting).toBe(serviceProviderMock);
    });

    it('should throw a ForbiddenException when the authenticated user does not own the provider', async () => {
      repositoryMock.findOneBy.mockResolvedValue(serviceProviderMock);

      await expect(service.findOneOwnedByOrFail(serviceProviderMock.id, 3)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: serviceProviderMock.id });
    });

    it('should throw a ForbiddenException when the provider has no owner', async () => {
      const anotherServiceProviderMock = {
        ...serviceProviderMock,
        ownerUserId: null,
      };

      repositoryMock.findOneBy.mockResolvedValue(anotherServiceProviderMock);

      await expect(
        service.findOneOwnedByOrFail(serviceProviderMock.id, serviceProviderMock.ownerUserId),
      ).rejects.toThrow(ForbiddenException);
      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: anotherServiceProviderMock.id });
    });

    it('should throw a NotFoundException when the provider does not exist', async () => {
      repositoryMock.findOneBy.mockResolvedValue(null);

      await expect(
        service.findOneOwnedByOrFail(999, serviceProviderMock.ownerUserId),
      ).rejects.toThrow(NotFoundException);
      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: 999 });
    });
  });
});
