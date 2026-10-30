import { Module } from '@nestjs/common';
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
import { UsersModule } from './users/users.module.js';
import { CreateUsersTable1790601439138 } from './database/migrations/1790601439138-CreateUsersTable.js';
import { AuthModule } from './auth/auth.module.js';
import { AddServiceProviderOwner1791272307897 } from './database/migrations/1791272307897-AddServiceProviderOwner.js';
import { ServiceRequestsModule } from './service-requests/service-requests.module.js';
import { CreateServiceRequestsTable1791550235362 } from './database/migrations/1791550235362-CreateServiceRequestsTable.js';
import { AddServiceRequestProvider1792423748325 } from './database/migrations/1792423748325-AddServiceRequestProvider.js';
import { LinkReviewsToServiceRequests1792425147989 } from './database/migrations/1792425147989-LinkReviewsToServiceRequests.js';
import { CreateServiceRequestMessagesTable1792655516545 } from './database/migrations/1792655516545-CreateServiceRequestMessagesTable.js';
import { CreateServiceRequestMessageRemindersTable1792945282224 } from './database/migrations/1792945282224-CreateServiceRequestMessageRemindersTable.js';
import { ScheduleModule } from '@nestjs/schedule';
import { CreateRefreshSessionsTable1793030800379 } from './database/migrations/1793030800379-CreateRefreshSessionsTable.js';

const testMigrations = [
  InitialSchema1789026143459,
  AddCityIndex1789287684113,
  CreateReviewsTable1789293137887,
  CreateServiceOfferingsTable1790070822998,
  CreateUsersTable1790601439138,
  AddServiceProviderOwner1791272307897,
  CreateServiceRequestsTable1791550235362,
  AddServiceRequestProvider1792423748325,
  LinkReviewsToServiceRequests1792425147989,
  CreateServiceRequestMessagesTable1792655516545,
  CreateServiceRequestMessageRemindersTable1792945282224,
  CreateRefreshSessionsTable1793030800379,
];
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().port().default(3000),
        DATABASE_PATH: Joi.string().min(1).default('entraide.sqlite'),
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        JWT_SECRET: Joi.string().min(32).required(),
        SMTP_HOST: Joi.string().trim().min(1).default('127.0.0.1'),
        SMTP_PORT: Joi.number().integer().min(1).max(65535).default(1025),
        SMTP_SECURE: Joi.boolean().default(false),
        MAIL_FROM: Joi.string()
          .email({ tlds: { allow: false } })
          .default('no-reply@entraide.test'),
        MESSAGE_REMINDERS_ENABLED: Joi.boolean().default(false),
        REFRESH_SESSION_TTL_DAYS: Joi.number().integer().positive().default(7),
      }),
    }),
    ScheduleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        cronJobs: configService.getOrThrow<string>('NODE_ENV') !== 'test',
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
    UsersModule,
    AuthModule,
    ServiceRequestsModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor }],
})
export class AppModule {}
