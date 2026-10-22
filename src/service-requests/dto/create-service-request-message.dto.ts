import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateServiceRequestMessageDto {
  @ApiProperty({
    description: 'Content of the message sent to the other request participant',
    example: 'Bonjour, serais-tu disponible samedi matin ?',
    minLength: 1,
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  @Matches(/\S/)
  content: string;
}
