import { ApiProperty } from '@nestjs/swagger';

export class ServiceRequestUnreadMessageCountsDto {
  @ApiProperty({
    example: 4,
    minimum: 0,
    description: 'Unread received replies in requests sent by the authenticated user',
  })
  sentRequests: number;

  @ApiProperty({
    example: 5,
    minimum: 0,
    description: 'Unread received replies in requests addressed to the authenticated user',
  })
  receivedRequests: number;

  @ApiProperty({ example: 9, minimum: 0, description: 'Total number of unread received replies' })
  total: number;
}
