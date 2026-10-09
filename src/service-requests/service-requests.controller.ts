import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateServiceRequestDto } from './dto/create-service-request.dto.js';
import { ServiceRequest } from './service-request.entity.js';
import { ServiceRequestsService } from './service-requests.service.js';

@ApiTags('service-requests')
@Controller()
export class ServiceRequestsController {
  constructor(private readonly serviceRequestsService: ServiceRequestsService) {}

  @ApiOperation({ summary: 'Send a request for a service offering' })
  @ApiCreatedResponse({ type: ServiceRequest })
  @ApiBadRequestResponse({
    description: 'The identifiers or request body are invalid',
  })
  @ApiNotFoundResponse({
    description: 'Service provider not found or offering not found for this provider',
  })
  @ApiConflictResponse({
    description: 'The service provider profile has no owner',
  })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired access token',
  })
  @UseGuards(JwtAuthGuard)
  @Post(
    'service-providers/:serviceProviderId/service-offerings/:serviceOfferingId/service-requests',
  )
  create(
    @Param('serviceProviderId', ParseIntPipe) serviceProviderId: number,
    @Param('serviceOfferingId', ParseIntPipe) serviceOfferingId: number,
    @Body() createServiceRequestDto: CreateServiceRequestDto,
    @Req() request: Request & { user: { id: number } },
  ): Promise<ServiceRequest> {
    return this.serviceRequestsService.create(
      serviceProviderId,
      serviceOfferingId,
      createServiceRequestDto,
      request.user.id,
    );
  }

  @ApiOperation({ summary: 'List requests sent by the authenticated user' })
  @ApiOkResponse({ type: ServiceRequest, isArray: true })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired access token',
  })
  @UseGuards(JwtAuthGuard)
  @Get('service-requests/sent')
  findSentByUser(@Req() request: Request & { user: { id: number } }): Promise<ServiceRequest[]> {
    return this.serviceRequestsService.findSentByUser(request.user.id);
  }

  @ApiOperation({ summary: 'List requests received by the authenticated user' })
  @ApiOkResponse({ type: ServiceRequest, isArray: true })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired access token',
  })
  @UseGuards(JwtAuthGuard)
  @Get('service-requests/received')
  findReceivedByUser(
    @Req() request: Request & { user: { id: number } },
  ): Promise<ServiceRequest[]> {
    return this.serviceRequestsService.findReceivedByUser(request.user.id);
  }
}
