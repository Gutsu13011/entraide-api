import { Module } from '@nestjs/common';
import { ServiceProvidersController } from './service-providers.controller.js';
import { ServiceProvidersService } from './service-providers.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceProvider } from './service-provider.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceProvider]), AuthModule, UsersModule],
  controllers: [ServiceProvidersController],
  providers: [ServiceProvidersService],
  exports: [ServiceProvidersService],
})
export class ServiceProvidersModule {}
