import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { CreateServiceProviderDto } from '../service-providers/dto/create-service-provider.dto.js';
import { demoServiceProviders } from './demo-service-providers.js';
import dataSource from './data-source.js';
import { ServiceProvider } from '../service-providers/service-provider.entity.js';
import { demoReviews } from './demo-reviews.js';
import { CreateReviewDto } from '../reviews/dto/create-review.dto.js';
import { Review } from '../reviews/review.entity.js';
import { demoServiceOfferings } from './demo-service-offerings.js';
import { CreateServiceOfferingDto } from '../service-offerings/dto/create-service-offering.dto.js';
import { ServiceOffering } from '../service-offerings/service-offering.entity.js';

async function seed() {
  const providers = plainToInstance(CreateServiceProviderDto, demoServiceProviders);
  const reviews = plainToInstance(
    CreateReviewDto,
    demoReviews.map(({ review }) => review),
  );
  const offerings = plainToInstance(
    CreateServiceOfferingDto,
    demoServiceOfferings.map(({ serviceOffering }) => serviceOffering),
  );

  for (const provider of providers) {
    await validateOrReject(provider, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  for (const review of reviews) {
    await validateOrReject(review, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  for (const offering of offerings) {
    await validateOrReject(offering, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  for (const { serviceProviderIndex } of demoReviews) {
    if (
      !Number.isInteger(serviceProviderIndex) ||
      serviceProviderIndex < 0 ||
      serviceProviderIndex >= providers.length
    ) {
      throw new Error(`Invalid service provider index: ${serviceProviderIndex}`);
    }
  }

  for (const { serviceProviderIndex } of demoServiceOfferings) {
    if (
      !Number.isInteger(serviceProviderIndex) ||
      serviceProviderIndex < 0 ||
      serviceProviderIndex > providers.length - 1
    ) {
      throw new Error(`Invalid service provider index: ${serviceProviderIndex}`);
    }
  }

  console.log(
    `Validated ${providers.length} demo service providers and ${reviews.length} demo reviews and ${offerings.length} demo service offerings.`,
  );

  await dataSource.initialize();

  try {
    await dataSource.transaction(async (manager) => {
      const serviceProviderRepository = manager.getRepository(ServiceProvider);
      const reviewRepository = manager.getRepository(Review);
      const serviceOfferingRepository = manager.getRepository(ServiceOffering);

      if ((await serviceProviderRepository.count()) > 0) {
        console.log('Demo seed skipped: service providers already exist.');
        return;
      }

      const serviceProviderEntities = serviceProviderRepository.create(providers);
      const savedServiceProviders = await serviceProviderRepository.save(serviceProviderEntities);

      const reviewEntities = reviewRepository.create(
        demoReviews.map(({ serviceProviderIndex, review }) => ({
          ...review,
          serviceProviderId: savedServiceProviders[serviceProviderIndex].id,
        })),
      );

      await reviewRepository.save(reviewEntities);

      const serviceOfferingEntities = serviceOfferingRepository.create(
        demoServiceOfferings.map(({ serviceProviderIndex, serviceOffering }) => ({
          ...serviceOffering,
          serviceProviderId: savedServiceProviders[serviceProviderIndex].id,
          hourlyRate: serviceOffering.hourlyRate ?? null,
        })),
      );

      await serviceOfferingRepository.save(serviceOfferingEntities);

      console.log(
        `Inserted ${savedServiceProviders.length} demo service providers and ${reviewEntities.length} demo reviews and ${serviceOfferingEntities.length} demo service offerings.`,
      );
    });
  } finally {
    await dataSource.destroy();
  }
}

await seed();
