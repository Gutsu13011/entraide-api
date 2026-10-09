import { Test, TestingModule } from '@nestjs/testing';
import { ServiceOfferingService } from './service-offering.service.js';
import { ServiceOffering } from './service-offering.entity.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ServiceProvidersService } from '../service-providers/service-providers.service.js';
import { CreateServiceOfferingDto } from './dto/create-service-offering.dto.js';
import type { UpdateServiceOfferingDto } from './dto/update-service-offering.dto.js';
import { ServicePricingType } from './service-pricing-type.enum.js';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ServiceOfferingService', () => {
  let service: ServiceOfferingService;
  const repositoryMock = {
    create: vi.fn(),
    save: vi.fn(),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn(),
  };
  const serviceProvidersServiceMock = {
    findOne: vi.fn(),
    findOneOwnedByOrFail: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    serviceProvidersServiceMock.findOneOwnedByOrFail.mockReset();
    repositoryMock.findOneBy.mockReset();
    repositoryMock.remove.mockReset();

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

  describe('remove', () => {
    const offering = Object.assign(new ServiceOffering(), {
      id: 12,
      serviceProviderId: 1,
      title: 'Conseil plomberie',
      description: 'Conseils pour votre installation.',
      pricingType: ServicePricingType.FREE,
      hourlyRate: null,
    });

    beforeEach(() => {
      serviceProvidersServiceMock.findOneOwnedByOrFail.mockResolvedValue({ id: 1, ownerUserId: 7 });
      repositoryMock.findOneBy.mockResolvedValue(offering);
      repositoryMock.remove.mockResolvedValue(offering);
    });

    it('should delete the offering from the owned provider and return no value', async () => {
      const result = await service.remove(1, 12, 7);

      expect(serviceProvidersServiceMock.findOneOwnedByOrFail).toHaveBeenCalledExactlyOnceWith(
        1,
        7,
      );
      expect(repositoryMock.findOneBy).toHaveBeenCalledExactlyOnceWith({
        id: 12,
        serviceProviderId: 1,
      });
      expect(repositoryMock.remove).toHaveBeenCalledExactlyOnceWith(offering);
      expect(result).toBeUndefined();
    });

    it.each([
      new ForbiddenException('You do not own this service provider profile'),
      new NotFoundException('Service provider not found'),
    ])(
      'should not look up or delete an offering when the provider check rejects with $name',
      async (error) => {
        serviceProvidersServiceMock.findOneOwnedByOrFail.mockRejectedValue(error);

        await expect(service.remove(1, 12, 7)).rejects.toBe(error);
        expect(repositoryMock.findOneBy).not.toHaveBeenCalled();
        expect(repositoryMock.remove).not.toHaveBeenCalled();
      },
    );

    it('should not delete an offering missing from the specified provider', async () => {
      repositoryMock.findOneBy.mockResolvedValue(null);

      await expect(service.remove(1, 12, 7)).rejects.toThrow(NotFoundException);
      expect(repositoryMock.findOneBy).toHaveBeenCalledExactlyOnceWith({
        id: 12,
        serviceProviderId: 1,
      });
      expect(repositoryMock.remove).not.toHaveBeenCalled();
    });

    it('should propagate a deletion failure', async () => {
      const error = new Error('Database unavailable');
      repositoryMock.remove.mockRejectedValue(error);

      await expect(service.remove(1, 12, 7)).rejects.toBe(error);
    });
  });

  describe('update', () => {
    let existingOffering: ServiceOffering;

    beforeEach(() => {
      existingOffering = Object.assign(new ServiceOffering(), {
        id: 12,
        serviceProviderId: 1,
        title: 'Conseil plomberie',
        description: 'Conseils pour entretenir votre installation.',
        pricingType: ServicePricingType.HOURLY,
        hourlyRate: 35,
      });
      serviceProvidersServiceMock.findOneOwnedByOrFail.mockResolvedValue({
        id: 1,
        ownerUserId: 7,
      });
      repositoryMock.findOneBy.mockResolvedValue(existingOffering);
      repositoryMock.save.mockImplementation(async (offering: ServiceOffering) => offering);
    });

    it('should clear the hourly rate when changing an hourly offering to free', async () => {
      const result = await service.update(1, 12, { pricingType: ServicePricingType.FREE }, 7);

      expect(serviceProvidersServiceMock.findOneOwnedByOrFail).toHaveBeenCalledWith(1, 7);
      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: 12, serviceProviderId: 1 });
      expect(repositoryMock.save).toHaveBeenCalledExactlyOnceWith({
        ...existingOffering,
        pricingType: ServicePricingType.FREE,
        hourlyRate: null,
      });
      expect(result).toEqual({
        ...existingOffering,
        pricingType: ServicePricingType.FREE,
        hourlyRate: null,
      });
      expect(existingOffering.hourlyRate).toBe(35);
    });

    it('should change a free offering to hourly with the supplied rate', async () => {
      existingOffering.pricingType = ServicePricingType.FREE;
      existingOffering.hourlyRate = null;
      const result = await service.update(
        1,
        12,
        { pricingType: ServicePricingType.HOURLY, hourlyRate: 42 },
        7,
      );

      expect(result).toEqual({
        ...existingOffering,
        pricingType: ServicePricingType.HOURLY,
        hourlyRate: 42,
      });
      expect(repositoryMock.save).toHaveBeenCalledExactlyOnceWith(result);
    });

    it.each([
      { pricingType: ServicePricingType.HOURLY, hourlyRate: 35 },
      { pricingType: ServicePricingType.FREE, hourlyRate: null },
    ])('should preserve $pricingType pricing when only the title changes', async (pricing) => {
      Object.assign(existingOffering, pricing);
      const result = await service.update(1, 12, { title: 'Nouveau titre' }, 7);

      expect(result).toEqual({ ...existingOffering, title: 'Nouveau titre' });
      expect(repositoryMock.save).toHaveBeenCalledExactlyOnceWith(result);
    });

    it('should update an hourly rate without requiring a pricing type', async () => {
      const result = await service.update(1, 12, { hourlyRate: 0.01 }, 7);

      expect(result).toEqual({ ...existingOffering, hourlyRate: 0.01 });
      expect(repositoryMock.save).toHaveBeenCalledExactlyOnceWith(result);
    });

    it.each([
      { label: 'an omitted rate', update: { pricingType: ServicePricingType.HOURLY } },
      {
        label: 'a null rate',
        update: { pricingType: ServicePricingType.HOURLY, hourlyRate: null },
      },
    ])('should reject changing a free offering to hourly with $label', async ({ update }) => {
      existingOffering.pricingType = ServicePricingType.FREE;
      existingOffering.hourlyRate = null;
      const original = { ...existingOffering };

      await expect(service.update(1, 12, update, 7)).rejects.toThrow(
        'An hourly service offering requires an hourly rate',
      );
      expect(repositoryMock.save).not.toHaveBeenCalled();
      expect(existingOffering).toEqual(original);
    });

    it('should reject clearing the rate of an offering that remains hourly', async () => {
      await expect(service.update(1, 12, { hourlyRate: null }, 7)).rejects.toThrow(
        'An hourly service offering requires an hourly rate',
      );
      expect(repositoryMock.save).not.toHaveBeenCalled();
      expect(existingOffering.hourlyRate).toBe(35);
    });

    it.each([
      {
        label: 'changing to free with a rate',
        initialType: ServicePricingType.HOURLY,
        update: { pricingType: ServicePricingType.FREE, hourlyRate: 20 },
      },
      {
        label: 'adding a rate to a free offering',
        initialType: ServicePricingType.FREE,
        update: { hourlyRate: 20 },
      },
    ])('should reject $label without mutating the offering', async ({ initialType, update }) => {
      existingOffering.pricingType = initialType;
      existingOffering.hourlyRate = initialType === ServicePricingType.FREE ? null : 35;
      const original = { ...existingOffering };

      await expect(service.update(1, 12, update, 7)).rejects.toThrow(
        'A free service offering cannot have an hourly rate',
      );
      expect(repositoryMock.save).not.toHaveBeenCalled();
      expect(existingOffering).toEqual(original);
    });

    it('should accept an explicit null rate when changing to free', async () => {
      const result = await service.update(
        1,
        12,
        { pricingType: ServicePricingType.FREE, hourlyRate: null },
        7,
      );

      expect(result).toEqual({
        ...existingOffering,
        pricingType: ServicePricingType.FREE,
        hourlyRate: null,
      });
      expect(repositoryMock.save).toHaveBeenCalledExactlyOnceWith(result);
    });

    it.each([
      new ForbiddenException('You do not own this service provider profile'),
      new NotFoundException('Service provider with id 1 not found'),
    ])(
      'should stop before looking up the offering when the provider check rejects with $name',
      async (error) => {
        serviceProvidersServiceMock.findOneOwnedByOrFail.mockRejectedValue(error);

        await expect(service.update(1, 12, { title: 'Nouveau titre' }, 7)).rejects.toBe(error);
        expect(repositoryMock.findOneBy).not.toHaveBeenCalled();
        expect(repositoryMock.save).not.toHaveBeenCalled();
      },
    );

    it('should reject an offering not found for the specified provider', async () => {
      repositoryMock.findOneBy.mockResolvedValue(null);

      await expect(service.update(1, 12, { title: 'Nouveau titre' }, 7)).rejects.toThrow(
        NotFoundException,
      );
      expect(repositoryMock.findOneBy).toHaveBeenCalledExactlyOnceWith({
        id: 12,
        serviceProviderId: 1,
      });
      expect(repositoryMock.save).not.toHaveBeenCalled();
    });

    it('should propagate a save failure', async () => {
      const error = new Error('Database unavailable');
      repositoryMock.save.mockRejectedValue(error);
      const update: UpdateServiceOfferingDto = { description: 'Description mise à jour.' };

      await expect(service.update(1, 12, update, 7)).rejects.toBe(error);
    });
  });
});
