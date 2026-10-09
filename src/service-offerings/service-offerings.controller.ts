import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ServiceOfferingService } from './service-offering.service.js';
import { ServiceOffering } from './service-offering.entity.js';
import { CreateServiceOfferingDto } from './dto/create-service-offering.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { Request } from 'express';
import { UpdateServiceOfferingDto } from './dto/update-service-offering.dto.js';

@ApiTags('service-offerings')
@Controller('service-providers/:serviceProviderId/service-offerings')
export class ServiceOfferingsController {
  constructor(private readonly serviceOfferingService: ServiceOfferingService) {}

  @ApiOperation({ summary: 'List service offerings for a service provider' })
  @ApiOkResponse({ type: ServiceOffering, isArray: true })
  @ApiBadRequestResponse({ description: 'The service provider id must be an integer' })
  @ApiNotFoundResponse({ description: 'Service provider not found' })
  @Get()
  findAll(
    @Param('serviceProviderId', ParseIntPipe) serviceProviderId: number,
  ): Promise<ServiceOffering[]> {
    return this.serviceOfferingService.findAllForServiceProvider(serviceProviderId);
  }

  @ApiOperation({ summary: 'Create a service offering for a service provider' })
  @ApiCreatedResponse({ type: ServiceOffering })
  @ApiBadRequestResponse({ description: 'The service provider id or request body is invalid' })
  @ApiNotFoundResponse({ description: 'Service provider not found' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired access token',
  })
  @ApiForbiddenResponse({
    description: 'The authenticated user does not own this service provider profile',
  })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Param('serviceProviderId', ParseIntPipe) serviceProviderId: number,
    @Body() createServiceOfferingDto: CreateServiceOfferingDto,
    @Req() request: Request & { user: { id: number } },
  ): Promise<ServiceOffering> {
    return this.serviceOfferingService.create(
      serviceProviderId,
      createServiceOfferingDto,
      request.user.id,
    );
  }

  @ApiOperation({ summary: 'Update a service offering for a service provider' })
  @ApiOkResponse({ type: ServiceOffering })
  @ApiBadRequestResponse({
    description: 'The identifiers, request body or resulting pricing are invalid',
  })
  @ApiNotFoundResponse({
    description: 'Service provider not found or offering not found for this provider',
  })
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
    @Param('serviceProviderId', ParseIntPipe) serviceProviderId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateServiceOfferingDto: UpdateServiceOfferingDto,
    @Req() request: Request & { user: { id: number } },
  ): Promise<ServiceOffering> {
    return this.serviceOfferingService.update(
      serviceProviderId,
      id,
      updateServiceOfferingDto,
      request.user.id,
    );
  }

  @ApiOperation({ summary: 'Delete a service offering for a service provider' })
  @ApiNoContentResponse({ description: 'Service offering successfully deleted' })
  @ApiBadRequestResponse({ description: 'The identifiers must be integers' })
  @ApiNotFoundResponse({
    description: 'Service provider not found or offering not found for this provider',
  })
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
    @Param('serviceProviderId', ParseIntPipe) serviceProviderId: number,
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request & { user: { id: number } },
  ): Promise<void> {
    return this.serviceOfferingService.remove(serviceProviderId, id, request.user.id);
  }
}
