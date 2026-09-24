import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ServiceOfferingService } from './service-offering.service.js';
import { ServiceOffering } from './service-offering.entity.js';
import { CreateServiceOfferingDto } from './dto/create-service-offering.dto.js';

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
  @Post()
  create(
    @Param('serviceProviderId', ParseIntPipe) serviceProviderId: number,
    @Body() createServiceOfferingDto: CreateServiceOfferingDto,
  ): Promise<ServiceOffering> {
    return this.serviceOfferingService.create(serviceProviderId, createServiceOfferingDto);
  }
}
