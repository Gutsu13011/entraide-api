import { Controller, Get, Param, ParseIntPipe, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ReviewsService } from './reviews.service.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { ReviewSummaryDto } from './dto/review-summary.dto.js';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { Request } from 'express';
import { ReviewResponseDto } from './dto/review-response.dto.js';

@ApiTags('reviews')
@Controller('service-providers/:serviceProviderId/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @ApiOperation({ summary: 'List reviews for a service provider' })
  @ApiOkResponse({ type: ReviewResponseDto, isArray: true })
  @ApiBadRequestResponse({ description: 'The service provider id must be an integer' })
  @ApiNotFoundResponse({ description: 'Service provider not found' })
  @Get()
  findAll(
    @Param('serviceProviderId', ParseIntPipe) serviceProviderId: number,
  ): Promise<ReviewResponseDto[]> {
    return this.reviewsService.findAllForServiceProvider(serviceProviderId);
  }

  @ApiOperation({ summary: 'Create a review for a completed service request' })
  @ApiCreatedResponse({ type: ReviewResponseDto })
  @ApiBadRequestResponse({ description: 'The service provider id or request body is invalid' })
  @ApiNotFoundResponse({
    description: 'Service provider not found or service request not found for this provider',
  })
  @ApiForbiddenResponse({ description: 'Only the requester can review this service' })
  @ApiConflictResponse({
    description: 'The service request is not completed or has already been reviewed',
  })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired access token',
  })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Param('serviceProviderId', ParseIntPipe) serviceProviderId: number,
    @Body() createReviewDto: CreateReviewDto,
    @Req() request: Request & { user: { id: number } },
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.create(serviceProviderId, createReviewDto, request.user.id);
  }

  @ApiOperation({ summary: 'Get the review summary for a service provider' })
  @ApiOkResponse({ type: ReviewSummaryDto })
  @ApiBadRequestResponse({ description: 'The service provider id must be an integer' })
  @ApiNotFoundResponse({ description: 'Service provider not found' })
  @Get('summary')
  getSummary(
    @Param('serviceProviderId', ParseIntPipe) serviceProviderId: number,
  ): Promise<ReviewSummaryDto> {
    return this.reviewsService.getSummaryForServiceProvider(serviceProviderId);
  }
}
