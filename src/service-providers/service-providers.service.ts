import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository, FindOptionsWhere } from 'typeorm';
import { Like } from 'typeorm';
import { ServiceProvider } from './service-provider.entity.js';
import type { CreateServiceProviderDto } from './dto/create-service-provider.dto.js';
import type { UpdateServiceProviderDto } from './dto/update-service-provider.dto.js';
import type { QueryServiceProvidersDto } from './dto/query-service-providers.dto.js';
import type { PaginatedServiceProvidersDto } from './dto/paginated-service-providers.dto.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class ServiceProvidersService {
  constructor(
    @InjectRepository(ServiceProvider)
    private readonly serviceProvidersRepository: Repository<ServiceProvider>,
    private readonly usersService: UsersService,
  ) {}

  private async findOneOrFail(id: number): Promise<ServiceProvider> {
    const serviceProvider = await this.serviceProvidersRepository.findOneBy({
      id,
    });

    if (serviceProvider === null) {
      throw new NotFoundException(`Service provider with id ${id} not found`);
    }

    return serviceProvider;
  }

  async findAll(
    queryServiceProvidersDto: QueryServiceProvidersDto,
  ): Promise<PaginatedServiceProvidersDto> {
    const { page, limit, city, available, sortOrder, sortBy, search } = queryServiceProvidersDto;
    const baseWhere: FindOptionsWhere<ServiceProvider> = {
      ...(city === undefined ? {} : { city }),
      ...(available === undefined ? {} : { available }),
    };
    const where: FindOptionsWhere<ServiceProvider> | FindOptionsWhere<ServiceProvider>[] =
      search === undefined
        ? baseWhere
        : [
            { ...baseWhere, firstName: Like(`%${search}%`) },
            { ...baseWhere, lastName: Like(`%${search}%`) },
            { ...baseWhere, profession: Like(`%${search}%`) },
            { ...baseWhere, description: Like(`%${search}%`) },
          ];
    const [data, total] = await this.serviceProvidersRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { [sortBy]: sortOrder },
      where,
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  findOne(id: number): Promise<ServiceProvider> {
    return this.findOneOrFail(id);
  }

  async create(
    createServiceProviderDto: CreateServiceProviderDto,
    ownerUserId: number,
  ): Promise<ServiceProvider> {
    const user = await this.usersService.findById(ownerUserId);

    if (user === null) {
      throw new UnauthorizedException('User no longer exists');
    }

    const serviceProviderUser = await this.serviceProvidersRepository.findOneBy({ ownerUserId });

    if (serviceProviderUser !== null) {
      throw new ConflictException('User already owns a service provider profile');
    }

    const serviceProvider = this.serviceProvidersRepository.create({
      ...createServiceProviderDto,
      lastName: user.lastName,
      firstName: user.firstName,
      ownerUserId,
    });

    return this.serviceProvidersRepository.save(serviceProvider);
  }

  async update(
    id: number,
    updateServiceProviderDto: UpdateServiceProviderDto,
    userId: number,
  ): Promise<ServiceProvider> {
    const serviceProvider = await this.findOneOwnedByOrFail(id, userId);

    Object.assign(serviceProvider, updateServiceProviderDto);

    return this.serviceProvidersRepository.save(serviceProvider);
  }

  async remove(id: number, userId: number): Promise<void> {
    const serviceProvider = await this.findOneOwnedByOrFail(id, userId);

    await this.serviceProvidersRepository.remove(serviceProvider);
  }

  async findOneOwnedByOrFail(id: number, userId: number): Promise<ServiceProvider> {
    const serviceProvider = await this.findOneOrFail(id);

    if (serviceProvider.ownerUserId !== userId) {
      throw new ForbiddenException('You do not own this service provider profile');
    }

    return serviceProvider;
  }
}
