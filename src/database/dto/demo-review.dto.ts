import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class DemoReviewDto {
  @IsString()
  @IsNotEmpty()
  authorName: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @IsNotEmpty()
  comment: string;
}
