import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: 'http://localhost:4200' });
  app.enableShutdownHooks();
  app.use(helmet({ contentSecurityPolicy: false }));

  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('PORT');
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Entraide API')
    .setDescription('API for managing service providers')
    .setVersion('1.0')
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('api', app, documentFactory);

  await app.listen(port);

  logger.log('Application started', {
    port,
    swaggerPath: '/api',
  });
}
await bootstrap();
