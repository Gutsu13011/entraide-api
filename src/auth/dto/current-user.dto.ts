import { ApiProperty } from '@nestjs/swagger';

export class CurrentUserDto {
  @ApiProperty({ example: 1 })
  id: number;
  @ApiProperty({ example: 'Alice' })
  firstName: string;
  @ApiProperty({ example: 'Martin' })
  lastName: string;
  @ApiProperty({ example: 'alicemartin@example.com' })
  email: string;
}
