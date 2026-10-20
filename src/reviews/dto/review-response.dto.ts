import { ApiProperty } from '@nestjs/swagger';

export class ReviewResponseDto {
  @ApiProperty({
    example: 8,
  })
  id: number;

  @ApiProperty({ example: 'Bruno Leroy' })
  authorName: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  rating: number;

  @ApiProperty({ example: 'Excellent service' })
  comment: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-10T09:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Identifier of the reviewed service provider profile',
    example: 13,
  })
  serviceProviderId: number;
}
