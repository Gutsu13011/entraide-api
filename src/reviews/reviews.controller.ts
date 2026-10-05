import { Controller, Get, Param, ParseIntPipe, Post, Body, UseGuards } from '@nestjs/common';
import { ReviewsService } from './reviews.service.js';
import { Review } from './review.entity.js';
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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@ApiTags('reviews')
@Controller('service-providers/:serviceProviderId/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @ApiOperation({ summary: 'List reviews for a service provider' })
  @ApiOkResponse({ type: Review, isArray: true })
  @ApiBadRequestResponse({ description: 'The service provider id must be an integer' })
  @ApiNotFoundResponse({ description: 'Service provider not found' })
  @Get()
  findAll(@Param('serviceProviderId', ParseIntPipe) serviceProviderId: number): Promise<Review[]> {
    return this.reviewsService.findAllForServiceProvider(serviceProviderId);
  }

  @ApiOperation({ summary: 'Create a review for a service provider' })
  @ApiCreatedResponse({ type: Review })
  @ApiBadRequestResponse({ description: 'The service provider id or request body is invalid' })
  @ApiNotFoundResponse({ description: 'Service provider not found' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired access token',
  })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Param('serviceProviderId', ParseIntPipe) serviceProviderId: number,
    @Body() createReviewDto: CreateReviewDto,
  ): Promise<Review> {
    return this.reviewsService.create(serviceProviderId, createReviewDto);
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
