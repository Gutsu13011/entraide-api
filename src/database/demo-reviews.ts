import type { CreateReviewDto } from '../reviews/dto/create-review.dto.js';

export interface DemoReview {
  serviceProviderIndex: number;
  review: CreateReviewDto;
}

export const demoReviews: DemoReview[] = [
  {
    serviceProviderIndex: 0,
    review: {
      authorName: 'Alice Martin',
      rating: 5,
      comment: 'Intervention rapide, soignée et très professionnelle.',
    },
  },
  {
    serviceProviderIndex: 0,
    review: {
      authorName: 'Karim Benali',
      rating: 4,
      comment: 'Très bon travail et explications claires.',
    },
  },
  {
    serviceProviderIndex: 2,
    review: {
      authorName: 'Élodie Simon',
      rating: 5,
      comment: 'Mon jardin a retrouvé une seconde jeunesse.',
    },
  },
  {
    serviceProviderIndex: 3,
    review: {
      authorName: 'Marc Leroy',
      rating: 4,
      comment: 'Dépannage efficace et conseils utiles.',
    },
  },
  {
    serviceProviderIndex: 8,
    review: {
      authorName: 'Nadia Fontaine',
      rating: 5,
      comment: 'Cours très pédagogiques et adaptés à mon niveau.',
    },
  },
  {
    serviceProviderIndex: 10,
    review: {
      authorName: 'Jules Caron',
      rating: 4,
      comment: 'Problème informatique résolu rapidement.',
    },
  },
  {
    serviceProviderIndex: 11,
    review: {
      authorName: 'Chloé Masson',
      rating: 5,
      comment: 'Finitions impeccables et chantier très propre.',
    },
  },
];
