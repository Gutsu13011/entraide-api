import { ApiProperty } from '@nestjs/swagger';
import { ServiceProvider } from '../service-provider.entity.js';

export class PaginatedServiceProvidersDto {
  @ApiProperty({ type: [ServiceProvider] })
  data: ServiceProvider[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 2 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}
