import { IsIn } from 'class-validator';
import { ServiceRequestStatus } from '../service-request-status.enum.js';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateServiceRequestStatusDto {
  @ApiProperty({
    description: 'New status requested by the recipient',
    enum: [
      ServiceRequestStatus.READ,
      ServiceRequestStatus.ACCEPTED,
      ServiceRequestStatus.REJECTED,
      ServiceRequestStatus.COMPLETED,
    ],
    example: ServiceRequestStatus.READ,
  })
  @IsIn([
    ServiceRequestStatus.ACCEPTED,
    ServiceRequestStatus.READ,
    ServiceRequestStatus.REJECTED,
    ServiceRequestStatus.COMPLETED,
  ])
  status: ServiceRequestStatus;
}
