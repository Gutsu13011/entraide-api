import { ApiProperty } from '@nestjs/swagger';

export class ServiceRequestParticipantDto {
  @ApiProperty({ example: 7 })
  id: number;

  @ApiProperty({ example: 'Alice' })
  firstName: string;

  @ApiProperty({ example: 'Martin' })
  lastName: string;
}
