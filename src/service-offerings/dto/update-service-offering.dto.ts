import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { CreateServiceOfferingDto } from './create-service-offering.dto.js';
import { IsNumber, IsOptional, IsPositive } from 'class-validator';

export class UpdateServiceOfferingDto extends PartialType(
  OmitType(CreateServiceOfferingDto, ['hourlyRate'] as const),
  { skipNullProperties: false },
) {
  @ApiPropertyOptional({
    example: 45,
    nullable: true,
    description:
      'Positive hourly rate for HOURLY offerings; null for FREE offerings. Omit to keep the existing rate unless changing pricing type.',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  declare hourlyRate?: number | null;
}
