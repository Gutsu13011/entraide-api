import { IsInt, IsString, IsNotEmpty, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({
    example: 41,
    minimum: 1,
    description: 'Identifier of the completed service request being reviewed',
  })
  @IsInt()
  @Min(1)
  serviceRequestId: number;

  @ApiProperty({ example: 2, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ example: 'Excellent service' })
  @IsString()
  @IsNotEmpty()
  comment: string;
}
