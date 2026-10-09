import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateServiceRequestDto {
  @ApiProperty({
    description: 'Message describing the requester’s needs',
    example: 'Bonjour, je souhaiterais faire repeindre ma chambre de 12 m².',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  message: string;
}
