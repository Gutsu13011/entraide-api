import { ApiProperty } from '@nestjs/swagger';
import { ServiceRequestParticipantDto } from './service-request-participant.dto.js';

export class ServiceRequestMessageResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({
    example: 'Bonjour, serais-tu disponible samedi matin ?',
  })
  content: string;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-10T09:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, example: null })
  readAt: Date | null;

  @ApiProperty({ example: 12 })
  serviceRequestId: number;

  @ApiProperty({ example: 42 })
  authorUserId: number;

  @ApiProperty({ type: ServiceRequestParticipantDto })
  author: ServiceRequestParticipantDto;
}
