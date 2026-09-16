import { PartialType } from '@nestjs/swagger';
import { CreateServiceProviderDto } from './create-service-provider.dto.js';

export class UpdateServiceProviderDto extends PartialType(CreateServiceProviderDto) {}
