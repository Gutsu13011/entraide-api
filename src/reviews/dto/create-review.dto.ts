import { IsInt, IsString, IsNotEmpty, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({ example: 'Alice Martin' })
  @IsString()
  @IsNotEmpty()
  authorName: string;

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
