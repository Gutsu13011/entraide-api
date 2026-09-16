import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository, FindOptionsWhere } from 'typeorm';
import { Like } from 'typeorm';
import { ServiceProvider } from './service-provider.entity.js';
import type { CreateServiceProviderDto } from './dto/create-service-provider.dto.js';
import type { UpdateServiceProviderDto } from './dto/update-service-provider.dto.js';
import type { QueryServiceProvidersDto } from './dto/query-service-providers.dto.js';
import type { PaginatedServiceProvidersDto } from './dto/paginated-service-providers.dto.js';

@Injectable()
export class ServiceProvidersService {
  constructor(
    @InjectRepository(ServiceProvider)
    private readonly serviceProvidersRepository: Repository<ServiceProvider>,
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

  async create(createServiceProviderDto: CreateServiceProviderDto): Promise<ServiceProvider> {
    const serviceProvider = this.serviceProvidersRepository.create(createServiceProviderDto);

    return this.serviceProvidersRepository.save(serviceProvider);
  }

  async update(
    id: number,
    updateServiceProviderDto: UpdateServiceProviderDto,
  ): Promise<ServiceProvider> {
    const serviceProvider = await this.findOneOrFail(id);

    Object.assign(serviceProvider, updateServiceProviderDto);

    return this.serviceProvidersRepository.save(serviceProvider);
  }

  async remove(id: number): Promise<void> {
    const serviceProvider = await this.findOneOrFail(id);

    await this.serviceProvidersRepository.remove(serviceProvider);
  }
}
