import { IsIn } from 'class-validator';
import { ServiceRequestStatus } from '../service-request-status.enum.js';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateServiceRequestStatusDto {
  @ApiProperty({
    description: 'New status requested by the recipient',
    enum: [ServiceRequestStatus.READ, ServiceRequestStatus.ACCEPTED, ServiceRequestStatus.REJECTED],
    example: ServiceRequestStatus.READ,
  })
  @IsIn([ServiceRequestStatus.ACCEPTED, ServiceRequestStatus.READ, ServiceRequestStatus.REJECTED])
  status: ServiceRequestStatus;
}
