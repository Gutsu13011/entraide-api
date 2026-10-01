import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Alice' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Martin' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'alicemartin@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'AzertYUIOP&é!ç5' })
  @IsString()
  @MinLength(15)
  @IsNotEmpty()
  password: string;
}
