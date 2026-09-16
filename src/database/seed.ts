import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { CreateServiceProviderDto } from '../service-providers/dto/create-service-provider.dto.js';
import { demoServiceProviders } from './demo-service-providers.js';
import dataSource from './data-source.js';
import { ServiceProvider } from '../service-providers/service-provider.entity.js';

async function seed() {
  const providers = plainToInstance(CreateServiceProviderDto, demoServiceProviders);

  for (const provider of providers) {
    await validateOrReject(provider, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  console.log(`Validated ${providers.length} demo service providers.`);

  await dataSource.initialize();

  try {
    const repository = dataSource.getRepository(ServiceProvider);

    if ((await repository.count()) > 0) {
      console.log('Demo seed skipped: service providers already exist.');
      return;
    }

    const entities = repository.create(providers);
    await repository.save(entities);

    console.log(`Inserted ${entities.length} demo service providers.`);
  } finally {
    await dataSource.destroy();
  }
}

await seed();
