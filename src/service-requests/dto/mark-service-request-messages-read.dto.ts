import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class MarkServiceRequestMessagesReadDto {
  @ApiProperty({
    description: 'Highest identifier among the messages displayed in this conversation',
    example: 102,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  upToMessageId: number;
}
