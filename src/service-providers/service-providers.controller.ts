import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  ParseIntPipe,
  Patch,
  Delete,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ServiceProvidersService } from './service-providers.service.js';
import { CreateServiceProviderDto } from './dto/create-service-provider.dto.js';
import { UpdateServiceProviderDto } from './dto/update-service-provider.dto.js';
import { QueryServiceProvidersDto } from './dto/query-service-providers.dto.js';
import { PaginatedServiceProvidersDto } from './dto/paginated-service-providers.dto.js';
import type { ServiceProvider } from './service-provider.entity.js';
import {
  ApiTags,
  ApiOperation,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';

@ApiTags('service-providers')
@Controller('service-providers')
export class ServiceProvidersController {
  constructor(private readonly serviceProvidersService: ServiceProvidersService) {}

  @ApiOperation({ summary: 'List service providers' })
  @ApiOkResponse({ type: PaginatedServiceProvidersDto })
  @Get()
  findAll(
    @Query() queryServiceProvidersDto: QueryServiceProvidersDto,
  ): Promise<PaginatedServiceProvidersDto> {
    return this.serviceProvidersService.findAll(queryServiceProvidersDto);
  }

  @ApiOperation({ summary: 'Get a service provider' })
  @ApiBadRequestResponse({ description: 'The id must be an integer' })
  @ApiNotFoundResponse({ description: 'Service provider not found' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ServiceProvider> {
    return this.serviceProvidersService.findOne(id);
  }

  @ApiOperation({ summary: 'Create a service provider' })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @Post()
  create(@Body() createServiceProviderDto: CreateServiceProviderDto): Promise<ServiceProvider> {
    return this.serviceProvidersService.create(createServiceProviderDto);
  }

  @ApiOperation({ summary: 'Update a service provider' })
  @ApiBadRequestResponse({ description: 'The id or request body is invalid' })
  @ApiNotFoundResponse({ description: 'Service provider not found' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateServiceProviderDto: UpdateServiceProviderDto,
  ): Promise<ServiceProvider> {
    return this.serviceProvidersService.update(id, updateServiceProviderDto);
  }

  @ApiOperation({ summary: 'Delete a service provider' })
  @ApiBadRequestResponse({ description: 'The id must be an integer' })
  @ApiNotFoundResponse({ description: 'Service provider not found' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.serviceProvidersService.remove(id);
  }
}
