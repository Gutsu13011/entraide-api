import { ApiProperty } from '@nestjs/swagger';
import { ServicePricingType } from '../../service-offerings/service-pricing-type.enum.js';
import { ServiceRequestStatus } from '../service-request-status.enum.js';
import { ServiceRequestParticipantDto } from './service-request-participant.dto.js';

export class ServiceRequestResponseDto {
  @ApiProperty({ example: 42 })
  id: number;

  @ApiProperty({ example: 'Bonjour, je souhaite repeindre ma chambre.' })
  message: string;

  @ApiProperty({
    enum: ServiceRequestStatus,
    example: ServiceRequestStatus.SENT,
  })
  status: ServiceRequestStatus;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-10T09:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({ example: 8 })
  requesterUserId: number;

  @ApiProperty({ example: 7 })
  recipientUserId: number;

  @ApiProperty({ type: Number, nullable: true, example: 12 })
  serviceOfferingId: number | null;

  @ApiProperty({ example: 'Peinture' })
  offeringTitleSnapshot: string;

  @ApiProperty({
    enum: ServicePricingType,
    example: ServicePricingType.HOURLY,
  })
  offeringPricingTypeSnapshot: ServicePricingType;

  @ApiProperty({ type: Number, nullable: true, example: 35 })
  offeringHourlyRateSnapshot: number | null;

  @ApiProperty({ type: ServiceRequestParticipantDto })
  requester: ServiceRequestParticipantDto;

  @ApiProperty({ type: ServiceRequestParticipantDto })
  recipient: ServiceRequestParticipantDto;
}
