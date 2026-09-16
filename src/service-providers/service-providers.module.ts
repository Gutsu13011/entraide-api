import { Module } from '@nestjs/common';
import { ServiceProvidersController } from './service-providers.controller.js';
import { ServiceProvidersService } from './service-providers.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceProvider } from './service-provider.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceProvider])],
  controllers: [ServiceProvidersController],
  providers: [ServiceProvidersService],
  exports: [ServiceProvidersService],
})
export class ServiceProvidersModule {}
