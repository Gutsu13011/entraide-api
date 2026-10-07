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
  UseGuards,
  Req,
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
  ApiUnauthorizedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { Request } from 'express';

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
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired access token, or the user no longer exists',
  })
  @ApiConflictResponse({
    description: 'The authenticated user already owns a service provider profile',
  })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body() createServiceProviderDto: CreateServiceProviderDto,
    @Req() request: Request & { user: { id: number } },
  ): Promise<ServiceProvider> {
    return this.serviceProvidersService.create(createServiceProviderDto, request.user.id);
  }

  @ApiOperation({ summary: 'Update a service provider' })
  @ApiBadRequestResponse({ description: 'The id or request body is invalid' })
  @ApiNotFoundResponse({ description: 'Service provider not found' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired access token',
  })
  @ApiForbiddenResponse({
    description: 'The authenticated user does not own this service provider profile',
  })
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateServiceProviderDto: UpdateServiceProviderDto,
    @Req() request: Request & { user: { id: number } },
  ): Promise<ServiceProvider> {
    return this.serviceProvidersService.update(id, updateServiceProviderDto, request.user.id);
  }

  @ApiOperation({ summary: 'Delete a service provider' })
  @ApiBadRequestResponse({ description: 'The id must be an integer' })
  @ApiNotFoundResponse({ description: 'Service provider not found' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired access token',
  })
  @ApiForbiddenResponse({
    description: 'The authenticated user does not own this service provider profile',
  })
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request & { user: { id: number } },
  ): Promise<void> {
    return this.serviceProvidersService.remove(id, request.user.id);
  }
}
