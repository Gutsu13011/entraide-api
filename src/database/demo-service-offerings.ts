import type { CreateServiceOfferingDto } from '../service-offerings/dto/create-service-offering.dto.js';
import { ServicePricingType } from '../service-offerings/service-pricing-type.enum.js';
import { demoServiceProviders } from './demo-service-providers.js';

export interface DemoServiceOffering {
  serviceProviderIndex: number;
  serviceOffering: CreateServiceOfferingDto;
}

const defaultDemoServiceOfferings: DemoServiceOffering[] = demoServiceProviders.map(
  (provider, index) => ({
    serviceProviderIndex: index,
    serviceOffering: {
      title: provider.profession,
      description: provider.description,
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: provider.hourlyRate,
    },
  }),
);

export const demoServiceOfferings: DemoServiceOffering[] = [
  ...defaultDemoServiceOfferings,
  {
    serviceProviderIndex: 0,
    serviceOffering: {
      title: 'Conseil Plomberie',
      description: 'Verification rapide de votre plomberie',
      pricingType: ServicePricingType.FREE,
    },
  },
  {
    serviceProviderIndex: 3,
    serviceOffering: {
      title: 'Diagnostic Informatique',
      description: 'Effectue un diagnostic rapide de votre ordinateur',
      pricingType: ServicePricingType.FREE,
    },
  },
];
