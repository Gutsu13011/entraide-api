import { ApiProperty } from '@nestjs/swagger';

export class ReviewSummaryDto {
  @ApiProperty({ example: 3, minimum: 0 })
  reviewCount: number;

  @ApiProperty({ example: 4.3, minimum: 1, maximum: 5, nullable: true, type: Number })
  averageRating: number | null;
}
