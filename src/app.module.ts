import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ServiceProvidersModule } from './service-providers/service-providers.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ReviewsModule } from './reviews/reviews.module.js';
import Joi from 'joi';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging/request-logging.interceptor.js';
import { HealthModule } from './health/health.module.js';
import { InitialSchema1789026143459 } from './database/migrations/1789026143459-InitialSchema.js';
import { AddCityIndex1789287684113 } from './database/migrations/1789287684113-AddCityIndex.js';
import { CreateReviewsTable1789293137887 } from './database/migrations/1789293137887-CreateReviewsTable.js';
import { ServiceOfferingsModule } from './service-offerings/service-offerings.module.js';
import { CreateServiceOfferingsTable1790070822998 } from './database/migrations/1790070822998-CreateServiceOfferingsTable.js';

const testMigrations = [
  InitialSchema1789026143459,
  AddCityIndex1789287684113,
  CreateReviewsTable1789293137887,
  CreateServiceOfferingsTable1790070822998,
];
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().port().default(3000),
        DATABASE_PATH: Joi.string().min(1).default('entraide.sqlite'),
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isTest = configService.getOrThrow<string>('NODE_ENV') === 'test';

        return {
          type: 'better-sqlite3',
          database: isTest ? ':memory:' : configService.getOrThrow<string>('DATABASE_PATH'),
          autoLoadEntities: true,
          synchronize: false,
          migrations: isTest ? testMigrations : [],
          migrationsRun: isTest,
        };
      },
    }),
    ServiceProvidersModule,
    ReviewsModule,
    HealthModule,
    ServiceOfferingsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor }],
})
export class AppModule {}
