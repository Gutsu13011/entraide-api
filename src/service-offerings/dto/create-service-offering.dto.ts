import {
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServicePricingType } from '../service-pricing-type.enum.js';

export class CreateServiceOfferingDto {
  @ApiProperty({ example: 'Réparation de fuite' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 'Recherche et réparation des fuites dans votre logement.',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    enum: ServicePricingType,
    example: ServicePricingType.HOURLY,
  })
  @IsEnum(ServicePricingType)
  pricingType: ServicePricingType;

  @ApiPropertyOptional({
    example: 45,
    nullable: true,
    description: 'Required when pricingType is HOURLY and omitted for FREE services.',
  })
  @ValidateIf(
    (serviceOffering: CreateServiceOfferingDto) =>
      serviceOffering.pricingType === ServicePricingType.HOURLY,
  )
  @IsDefined()
  @IsNumber()
  @IsPositive()
  hourlyRate?: number | null;
}
