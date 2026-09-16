import { IsBoolean, IsNumber, IsString, IsNotEmpty, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateServiceProviderDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'Sophie' })
  firstName: string;
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'Martin' })
  lastName: string;
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'Plombier' })
  profession: string;
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'Paris' })
  city: string;
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'Installation et réparation de plomberie pour les particuliers' })
  description: string;
  @IsNumber()
  @IsPositive()
  @ApiProperty({ example: 45 })
  hourlyRate: number;
  @IsString()
  @ApiProperty({ example: 'https://example.com/images/sophie.jpg' })
  imageUrl: string;
  @IsBoolean()
  @ApiProperty({ example: true })
  available: boolean;
}
