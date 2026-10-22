import {
  Body,
  Controller,
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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateServiceRequestDto } from './dto/create-service-request.dto.js';
import { ServiceRequestsService } from './service-requests.service.js';
import { ServiceRequestResponseDto } from './dto/service-request-response.dto.js';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto.js';
import { CreateServiceRequestMessageDto } from './dto/create-service-request-message.dto.js';
import { ServiceRequestMessageResponseDto } from './dto/service-request-message-response.dto.js';
import { MarkServiceRequestMessagesReadDto } from './dto/mark-service-request-messages-read.dto.js';

@ApiTags('service-requests')
@Controller()
export class ServiceRequestsController {
  constructor(private readonly serviceRequestsService: ServiceRequestsService) {}

  @ApiOperation({ summary: 'Send a request for a service offering' })
  @ApiCreatedResponse({ type: ServiceRequestResponseDto })
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
  ): Promise<ServiceRequestResponseDto> {
    return this.serviceRequestsService.create(
      serviceProviderId,
      serviceOfferingId,
      createServiceRequestDto,
      request.user.id,
    );
  }

  @ApiOperation({ summary: 'List requests sent by the authenticated user' })
  @ApiOkResponse({ type: ServiceRequestResponseDto, isArray: true })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired access token',
  })
  @UseGuards(JwtAuthGuard)
  @Get('service-requests/sent')
  findSentByUser(
    @Req() request: Request & { user: { id: number } },
  ): Promise<ServiceRequestResponseDto[]> {
    return this.serviceRequestsService.findSentByUser(request.user.id);
  }

  @ApiOperation({ summary: 'List requests received by the authenticated user' })
  @ApiOkResponse({ type: ServiceRequestResponseDto, isArray: true })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired access token',
  })
  @UseGuards(JwtAuthGuard)
  @Get('service-requests/received')
  findReceivedByUser(
    @Req() request: Request & { user: { id: number } },
  ): Promise<ServiceRequestResponseDto[]> {
    return this.serviceRequestsService.findReceivedByUser(request.user.id);
  }

  @ApiOperation({ summary: 'Update a service request status' })
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  @ApiBadRequestResponse({ description: 'The identifier or request body is invalid' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired access token' })
  @ApiForbiddenResponse({ description: 'Only the recipient can update this request' })
  @ApiNotFoundResponse({ description: 'Service request not found' })
  @ApiConflictResponse({ description: 'Invalid transition or concurrent request modification' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('service-requests/:id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateServiceRequestStatusDto: UpdateServiceRequestStatusDto,
    @Req() request: Request & { user: { id: number } },
  ): Promise<ServiceRequestResponseDto> {
    return this.serviceRequestsService.updateStatus(
      id,
      updateServiceRequestStatusDto,
      request.user.id,
    );
  }

  @ApiOperation({ summary: 'Send a message in a service request conversation' })
  @ApiCreatedResponse({ type: ServiceRequestMessageResponseDto })
  @ApiBadRequestResponse({ description: 'The identifier or message content is invalid' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired access token' })
  @ApiForbiddenResponse({ description: 'Only request participants can access this conversation' })
  @ApiNotFoundResponse({ description: 'Service request not found' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('service-requests/:id/messages')
  createMessage(
    @Param('id', ParseIntPipe) id: number,
    @Body() createServiceRequestMessageDto: CreateServiceRequestMessageDto,
    @Req() request: Request & { user: { id: number } },
  ): Promise<ServiceRequestMessageResponseDto> {
    return this.serviceRequestsService.createMessage(
      id,
      createServiceRequestMessageDto,
      request.user.id,
    );
  }

  @ApiOperation({ summary: 'List messages in a service request conversation' })
  @ApiOkResponse({ type: ServiceRequestMessageResponseDto, isArray: true })
  @ApiBadRequestResponse({ description: 'The request identifier is invalid' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired access token' })
  @ApiForbiddenResponse({ description: 'Only request participants can access this conversation' })
  @ApiNotFoundResponse({ description: 'Service request not found' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('service-requests/:id/messages')
  findMessages(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request & { user: { id: number } },
  ): Promise<ServiceRequestMessageResponseDto[]> {
    return this.serviceRequestsService.findMessages(id, request.user.id);
  }

  @ApiOperation({ summary: 'Mark received conversation messages as read' })
  @ApiNoContentResponse({
    description: 'Received messages marked as read up to the indicated message',
  })
  @ApiBadRequestResponse({ description: 'The request identifier or message boundary is invalid' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired access token' })
  @ApiForbiddenResponse({ description: 'Only request participants can access this conversation' })
  @ApiNotFoundResponse({
    description: 'Service request or message boundary not found in this conversation',
  })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @Patch('service-requests/:id/messages/read')
  markMessagesAsRead(
    @Param('id', ParseIntPipe) id: number,
    @Body() markServiceRequestMessagesReadDto: MarkServiceRequestMessagesReadDto,
    @Req() request: Request & { user: { id: number } },
  ): Promise<void> {
    return this.serviceRequestsService.markMessagesAsRead(
      id,
      markServiceRequestMessagesReadDto,
      request.user.id,
    );
  }
}
