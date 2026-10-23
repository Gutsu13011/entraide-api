import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceProvider } from './../src/service-providers/service-provider.entity.js';
import { ServiceOffering } from '../src/service-offerings/service-offering.entity.js';
import { ServicePricingType } from '../src/service-offerings/service-pricing-type.enum.js';
import { User } from '../src/users/user.entity.js';
import { UsersService } from '../src/users/users.service.js';
import argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { ServiceRequest } from '../src/service-requests/service-request.entity.js';
import { ServiceRequestStatus } from '../src/service-requests/service-request-status.enum.js';
import { Review } from '../src/reviews/review.entity.js';
import { ServiceRequestMessage } from '../src/service-requests/service-request-message.entity.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  async function getAccessToken(email: string = 'alicemartin@mail.com'): Promise<string> {
    const validUser = {
      firstName: 'Alice',
      lastName: 'Martin',
      email,
      password: 'unmotdepassedaumoins15caracteres',
    };

    await request(app.getHttpServer()).post('/auth/register').send(validUser).expect(201);
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: validUser.email, password: validUser.password })
      .expect(200);

    return loginResponse.body.accessToken;
  }

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const serviceProvidersRepository = app.get<Repository<ServiceProvider>>(
      getRepositoryToken(ServiceProvider),
    );

    await serviceProvidersRepository.save([
      {
        id: 1,
        firstName: 'Sophie',
        lastName: 'Martin',
        profession: 'Plombière',
        city: 'Paris',
        description: 'Installation et dépannage de plomberie pour particuliers.',
        hourlyRate: 50,
        available: true,
        imageUrl: '',
      },
      {
        id: 2,
        firstName: 'Thomas',
        lastName: 'Bernard',
        profession: 'Électricien',
        city: 'Lyon',
        description: 'Diagnostic et travaux électriques pour votre logement.',
        hourlyRate: 45,
        available: false,
        imageUrl: '',
      },
    ]);
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  it('/service-providers (GET)', () => {
    return request(app.getHttpServer())
      .get('/service-providers')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          total: 2,
          page: 1,
          limit: 10,
          totalPages: 1,
        });
        expect(response.body.data).toHaveLength(2);
        expect(response.body.data[0]).toMatchObject({
          id: 1,
          firstName: 'Sophie',
        });
      });
  });

  it('/service-providers?page=2&limit=1 (GET)', () => {
    return request(app.getHttpServer())
      .get('/service-providers?page=2&limit=1')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          total: 2,
          page: 2,
          limit: 1,
          totalPages: 2,
        });
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0]).toMatchObject({
          id: 2,
          firstName: 'Thomas',
        });
      });
  });

  it('/service-providers?page=0 (GET) should return 400', () => {
    return request(app.getHttpServer())
      .get('/service-providers?page=0')
      .expect(400)
      .expect((response) => {
        expect(response.body.message).toContain('page must not be less than 1');
      });
  });

  it('/service-providers?city=Paris (GET)', () => {
    return request(app.getHttpServer())
      .get('/service-providers?city=Paris')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        });

        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0]).toMatchObject({
          id: 1,
          firstName: 'Sophie',
          city: 'Paris',
        });
      });
  });

  it('/service-providers?available=false (GET)', () => {
    return request(app.getHttpServer())
      .get('/service-providers?available=false')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        });

        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0]).toMatchObject({
          id: 2,
          firstName: 'Thomas',
          available: false,
        });
      });
  });

  it('/service-providers?available=yes (GET) should return 400', () => {
    return request(app.getHttpServer())
      .get('/service-providers?available=yes')
      .expect(400)
      .expect((response) => {
        expect(response.body.message).toContain('available must be a boolean value');
      });
  });

  it('/service-providers?sortOrder=desc (GET)', () => {
    return request(app.getHttpServer())
      .get('/service-providers?sortOrder=desc')
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toHaveLength(2);
        expect(response.body.data[0]).toMatchObject({
          id: 2,
          firstName: 'Thomas',
        });
        expect(response.body.data[1]).toMatchObject({
          id: 1,
          firstName: 'Sophie',
        });
      });
  });

  it('/service-providers?sortBy=hourlyRate&sortOrder=ASC (GET)', () => {
    return request(app.getHttpServer())
      .get('/service-providers?sortBy=hourlyRate&sortOrder=ASC')
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toHaveLength(2);

        expect(response.body.data[0]).toMatchObject({
          id: 2,
          firstName: 'Thomas',
          hourlyRate: 45,
        });

        expect(response.body.data[1]).toMatchObject({
          id: 1,
          firstName: 'Sophie',
          hourlyRate: 50,
        });
      });
  });

  it('/service-providers?sortBy=firstName (GET) should return 400', () => {
    return request(app.getHttpServer())
      .get('/service-providers?sortBy=firstName')
      .expect(400)
      .expect((response) => {
        expect(response.body.message).toContain(
          'sortBy must be one of the following values: id, hourlyRate',
        );
      });
  });

  it('/service-providers?search=plomb (GET)', () => {
    return request(app.getHttpServer())
      .get('/service-providers?search=plomb')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        });

        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0]).toMatchObject({
          id: 1,
          firstName: 'Sophie',
          profession: 'Plombière',
        });
      });
  });

  it('/service-providers?search=spaces (GET) should return 400', () => {
    return request(app.getHttpServer())
      .get('/service-providers?search=%20%20%20')
      .expect(400)
      .expect((response) => {
        expect(response.body.message).toContain('search should not be empty');
      });
  });

  it('/service-providers/2 (GET)', () => {
    return request(app.getHttpServer())
      .get('/service-providers/2')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: 2,
          firstName: 'Thomas',
        });
      });
  });

  it('/service-providers/999 (GET) should return 404', () => {
    return request(app.getHttpServer()).get('/service-providers/999').expect(404).expect({
      message: 'Service provider with id 999 not found',
      error: 'Not Found',
      statusCode: 404,
    });
  });

  it('/service-providers/not-a-number (GET) should return 400', () => {
    return request(app.getHttpServer()).get('/service-providers/not-a-number').expect(400).expect({
      message: 'Validation failed (numeric string is expected)',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('/service-providers (POST) should create a profile owned by the authenticated user using account names', async () => {
    const createServiceProviderDto = {
      firstName: 'Julie',
      lastName: 'Durand',
      profession: 'Peintre',
      city: 'Marseille',
      description: 'Peinture intérieure et extérieure',
      hourlyRate: 35,
      available: true,
      imageUrl: '',
    };
    const accessToken = await getAccessToken();
    const currentUserResponse = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    return request(app.getHttpServer())
      .post('/service-providers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createServiceProviderDto)
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: 3,
          ...createServiceProviderDto,
          ownerUserId: currentUserResponse.body.id,
          firstName: currentUserResponse.body.firstName,
          lastName: currentUserResponse.body.lastName,
        });
      });
  });

  it('/service-providers (POST) should reject a second profile for the same user', async () => {
    const createServiceProviderDto = {
      firstName: 'Julie',
      lastName: 'Durand',
      profession: 'Peintre',
      city: 'Marseille',
      description: 'Peinture intérieure et extérieure',
      hourlyRate: 35,
      available: true,
      imageUrl: '',
    };
    const accessToken = await getAccessToken();

    await request(app.getHttpServer())
      .post('/service-providers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createServiceProviderDto)
      .expect(201);
    await request(app.getHttpServer())
      .post('/service-providers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createServiceProviderDto)
      .expect(409)
      .expect((response) => {
        expect(response.body.message).toBe('User already owns a service provider profile');
      });
    await request(app.getHttpServer())
      .get('/service-providers')
      .expect(200)
      .expect((response) => {
        expect(response.body.total).toBe(3);
      });
  });

  it('/service-providers (POST) should reject a client-supplied owner id', async () => {
    const createServiceProviderDto = {
      firstName: 'Julie',
      lastName: 'Durand',
      profession: 'Peintre',
      city: 'Marseille',
      description: 'Peinture intérieure et extérieure',
      hourlyRate: 35,
      available: true,
      imageUrl: '',
      ownerUserId: 999,
    };
    const accessToken = await getAccessToken();

    await request(app.getHttpServer())
      .post('/service-providers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createServiceProviderDto)
      .expect(400)
      .expect((response) => {
        expect(response.body.message).toContain('property ownerUserId should not exist');
      });
    await request(app.getHttpServer())
      .get('/service-providers')
      .expect(200)
      .expect((response) => {
        expect(response.body.total).toBe(2);
      });
  });

  it('/service-providers (POST) should reject creation when the authenticated user no longer exists', async () => {
    const createServiceProviderDto = {
      firstName: 'Julie',
      lastName: 'Durand',
      profession: 'Peintre',
      city: 'Marseille',
      description: 'Peinture intérieure et extérieure',
      hourlyRate: 35,
      available: true,
      imageUrl: '',
    };
    const accessToken = await getAccessToken();
    const currentUserResponse = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const userRepository = app.get<Repository<User>>(getRepositoryToken(User));

    await userRepository.delete(currentUserResponse.body.id);
    await request(app.getHttpServer())
      .post('/service-providers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createServiceProviderDto)
      .expect(401)
      .expect((response) => {
        expect(response.body.message).toBe('User no longer exists');
      });
    await request(app.getHttpServer())
      .get('/service-providers')
      .expect(200)
      .expect((response) => {
        expect(response.body.total).toBe(2);
      });
  });

  it('/service-providers (POST) should return 400 for an invalid body', async () => {
    const accessToken = await getAccessToken();

    return request(app.getHttpServer())
      .post('/service-providers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: '',
        lastName: 'Durand',
        profession: 'Peintre',
        city: 'Marseille',
        description: 'Test',
        hourlyRate: 35,
        available: true,
        imageUrl: '',
      })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          error: 'Bad Request',
          statusCode: 400,
        });
        expect(response.body.message).toContain('firstName should not be empty');
      });
  });

  it("/service-providers/:id (PATCH) should update the authenticated user's provider", async () => {
    const createServiceProviderDto = {
      firstName: 'Julie',
      lastName: 'Durand',
      profession: 'Peintre',
      city: 'Marseille',
      description: 'Peinture intérieure et extérieure',
      hourlyRate: 35,
      available: true,
      imageUrl: '',
    };
    const updateServiceProviderDto = {
      city: 'Nice',
      available: false,
    };
    const accessToken = await getAccessToken();
    const createdProviderResponse = await request(app.getHttpServer())
      .post('/service-providers/')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createServiceProviderDto)
      .expect(201);

    return request(app.getHttpServer())
      .patch(`/service-providers/${createdProviderResponse.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(updateServiceProviderDto)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: createdProviderResponse.body.id,
          firstName: 'Alice',
          city: 'Nice',
          available: false,
        });
      });
  });

  it("/service-providers/:id (DELETE) should delete the authenticated user's provider", async () => {
    const createServiceProviderDto = {
      firstName: 'Julie',
      lastName: 'Durand',
      profession: 'Peintre',
      city: 'Marseille',
      description: 'Peinture intérieure et extérieure',
      hourlyRate: 35,
      available: true,
      imageUrl: '',
    };
    const accessToken = await getAccessToken();
    const createdProviderResponse = await request(app.getHttpServer())
      .post('/service-providers/')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createServiceProviderDto)
      .expect(201);
    const deleteResponse = await request(app.getHttpServer())
      .delete(`/service-providers/${createdProviderResponse.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    expect(deleteResponse.text).toBe('');

    await request(app.getHttpServer())
      .get(`/service-providers/${createdProviderResponse.body.id}`)
      .expect(404);
  });

  it("/service-providers/:id (PATCH) should reject updating another user's provider", async () => {
    const createServiceProviderDto = {
      firstName: 'Julie',
      lastName: 'Durand',
      profession: 'Peintre',
      city: 'Marseille',
      description: 'Peinture intérieure et extérieure',
      hourlyRate: 35,
      available: true,
      imageUrl: '',
    };
    const ownerToken = await getAccessToken();
    const otherUserToken = await getAccessToken('other-user@example.com');

    const createdProviderResponse = await request(app.getHttpServer())
      .post('/service-providers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(createServiceProviderDto)
      .expect(201);

    const providerId = createdProviderResponse.body.id;

    await request(app.getHttpServer())
      .patch(`/service-providers/${providerId}`)
      .set('Authorization', `Bearer ${otherUserToken}`)
      .send({
        city: 'Nice',
        available: false,
      })
      .expect(403)
      .expect((response) => {
        expect(response.body.message).toBe('You do not own this service provider profile');
      });

    await request(app.getHttpServer())
      .get(`/service-providers/${providerId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: providerId,
          ownerUserId: createdProviderResponse.body.ownerUserId,
          city: 'Marseille',
          available: true,
        });
      });
  });

  it("/service-providers/:id (DELETE) should reject deleting another user's provider", async () => {
    const createServiceProviderDto = {
      firstName: 'Julie',
      lastName: 'Durand',
      profession: 'Peintre',
      city: 'Marseille',
      description: 'Peinture intérieure et extérieure',
      hourlyRate: 35,
      available: true,
      imageUrl: '',
    };
    const ownerToken = await getAccessToken();
    const otherUserToken = await getAccessToken('other-user@example.com');

    const createdProviderResponse = await request(app.getHttpServer())
      .post('/service-providers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(createServiceProviderDto)
      .expect(201);

    const providerId = createdProviderResponse.body.id;

    await request(app.getHttpServer())
      .delete(`/service-providers/${providerId}`)
      .set('Authorization', `Bearer ${otherUserToken}`)
      .expect(403)
      .expect((response) => {
        expect(response.body.message).toBe('You do not own this service provider profile');
      });

    await request(app.getHttpServer())
      .get(`/service-providers/${providerId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: providerId,
          ownerUserId: createdProviderResponse.body.ownerUserId,
          city: 'Marseille',
          available: true,
        });
      });
  });

  it('/service-providers (POST) should return 400 property id should not exist', async () => {
    const createServiceProviderDto = {
      id: 99,
      firstName: 'Julie',
      lastName: 'Durand',
      profession: 'Peintre',
      city: 'Marseille',
      description: 'Peinture intérieure et extérieure',
      hourlyRate: 35,
      available: true,
      imageUrl: '',
    };
    const accessToken = await getAccessToken();

    return request(app.getHttpServer())
      .post('/service-providers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createServiceProviderDto)
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          error: 'Bad Request',
          statusCode: 400,
        });
        expect(response.body.message).toContain('property id should not exist');
      });
  });

  describe('reviews for completed service requests', () => {
    const route = '/service-providers/:serviceProviderId/reviews';
    let ownerToken: string;
    let requesterToken: string;
    let providerId: number;
    let offeringId: number;
    let original: ServiceRequest;
    let reviewsRepository: Repository<Review>;
    let requestsRepository: Repository<ServiceRequest>;

    async function completeRequest() {
      const created = await request(app.getHttpServer())
        .post(`/service-providers/${providerId}/service-offerings/${offeringId}/service-requests`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ message: 'Bonjour, je souhaite faire repeindre ma chambre.' })
        .expect(201);
      for (const status of [ServiceRequestStatus.ACCEPTED, ServiceRequestStatus.COMPLETED]) {
        await request(app.getHttpServer())
          .patch(`/service-requests/${created.body.id}/status`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ status })
          .expect(200);
      }
      return requestsRepository.findOneByOrFail({ id: created.body.id });
    }

    beforeEach(async () => {
      ownerToken = await getAccessToken('review-owner@example.com');
      requesterToken = await getAccessToken('review-requester@example.com');
      const requesterUser = await app.get(UsersService).findByEmail('review-requester@example.com');
      await app.get<Repository<User>>(getRepositoryToken(User)).update(requesterUser!.id, {
        firstName: 'Bruno',
        lastName: 'Leroy',
      });
      const provider = await request(app.getHttpServer())
        .post('/service-providers')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          firstName: 'Alice',
          lastName: 'Martin',
          profession: 'Peintre',
          city: 'Paris',
          description: 'Peinture intérieure et extérieure.',
          hourlyRate: 35,
          available: true,
          imageUrl: '',
        })
        .expect(201);
      providerId = provider.body.id;
      expect(
        await app
          .get<Repository<ServiceProvider>>(getRepositoryToken(ServiceProvider))
          .findOneBy({ id: providerId }),
      ).toMatchObject({ id: providerId });
      const offering = await request(app.getHttpServer())
        .post(`/service-providers/${providerId}/service-offerings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Peinture',
          description: 'Peinture intérieure.',
          pricingType: ServicePricingType.HOURLY,
          hourlyRate: 35,
        })
        .expect((response) => {
          expect(
            response.status,
            `Offering fixture for provider ${providerId}: ${JSON.stringify(response.body)}`,
          ).toBe(201);
        });
      offeringId = offering.body.id;
      reviewsRepository = app.get<Repository<Review>>(getRepositoryToken(Review));
      requestsRepository = app.get<Repository<ServiceRequest>>(getRepositoryToken(ServiceRequest));
      original = await completeRequest();
    });

    function reviewBody() {
      return { serviceRequestId: original.id, rating: 5, comment: 'Excellent service' };
    }

    function postReview(
      body: object = reviewBody(),
      token = requesterToken,
      provider = providerId,
    ) {
      return request(app.getHttpServer())
        .post(`/service-providers/${provider}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    }

    async function expectNoReview() {
      expect(await reviewsRepository.count()).toBe(0);
      expect(await requestsRepository.findOneByOrFail({ id: original.id })).toEqual(original);
    }

    it.each(['sent', 'received'] as const)(
      '/service-requests/%s (GET) should restore hasReview per request on repeated reads without exposing review data',
      async (direction) => {
        const otherRequest = await completeRequest();
        const token = direction === 'sent' ? requesterToken : ownerToken;
        const getList = () =>
          request(app.getHttpServer())
            .get(`/service-requests/${direction}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        const before = await getList();
        expect(before.body).toHaveLength(2);
        expect(before.body.map((item: { hasReview: boolean }) => item.hasReview)).toEqual([
          false,
          false,
        ]);

        await postReview().expect(201);

        for (let read = 0; read < 2; read++) {
          const response = await getList();
          expect(response.body).toEqual(
            before.body.map((item: { id: number }) => ({
              ...item,
              hasReview: item.id === original.id,
            })),
          );
          expect(
            response.body.find((item: { id: number }) => item.id === otherRequest.id).hasReview,
          ).toBe(false);
          for (const item of response.body) {
            expect(item).not.toHaveProperty('review');
            expect(item).not.toHaveProperty('rating');
            expect(item).not.toHaveProperty('comment');
            expect(item).not.toHaveProperty('requesterUser');
            expect(item).not.toHaveProperty('recipientUser');
          }
        }
        expect(await requestsRepository.findOneByOrFail({ id: original.id })).toEqual(original);
      },
    );

    it.each(['sent', 'received'] as const)(
      '/service-requests/%s (GET) should preserve hasReview after offering deletion and clear it after provider deletion removes the review',
      async (direction) => {
        await postReview().expect(201);
        const token = direction === 'sent' ? requesterToken : ownerToken;
        await request(app.getHttpServer())
          .delete(`/service-providers/${providerId}/service-offerings/${offeringId}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(204);
        const afterOfferingDeletion = await request(app.getHttpServer())
          .get(`/service-requests/${direction}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(afterOfferingDeletion.body).toHaveLength(1);
        expect(afterOfferingDeletion.body[0]).toMatchObject({
          id: original.id,
          hasReview: true,
          serviceProviderId: providerId,
          serviceOfferingId: null,
        });

        await request(app.getHttpServer())
          .delete(`/service-providers/${providerId}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(204);
        const afterProviderDeletion = await request(app.getHttpServer())
          .get(`/service-requests/${direction}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(afterProviderDeletion.body).toEqual([
          {
            ...afterOfferingDeletion.body[0],
            hasReview: false,
            serviceProviderId: null,
          },
        ]);
        expect(await reviewsRepository.count()).toBe(0);
      },
    );

    it(`${route} (POST) should create one review with the requester account name without modifying the completed request`, async () => {
      const response = await postReview().expect(201);

      expect(response.body).toEqual({
        id: expect.any(Number),
        rating: 5,
        comment: 'Excellent service',
        serviceProviderId: providerId,
        authorName: 'Bruno Leroy',
        createdAt: expect.any(String),
      });
      expect(response.body).not.toHaveProperty('requesterUser');
      expect(response.body).not.toHaveProperty('serviceRequest');
      expect(await reviewsRepository.findOneByOrFail({ id: response.body.id })).toEqual({
        id: response.body.id,
        ...reviewBody(),
        serviceProviderId: providerId,
        authorName: 'Bruno Leroy',
        createdAt: new Date(response.body.createdAt),
      });
      expect(await reviewsRepository.count()).toBe(1);
      expect(await requestsRepository.findOneByOrFail({ id: original.id })).toEqual(original);
    });

    it(`${route} (GET) should publicly list only the six public review fields`, async () => {
      const created = await postReview().expect(201);

      const response = await request(app.getHttpServer())
        .get(`/service-providers/${providerId}/reviews`)
        .expect(200);

      expect(response.body).toEqual([
        {
          id: created.body.id,
          authorName: 'Bruno Leroy',
          rating: 5,
          comment: 'Excellent service',
          createdAt: created.body.createdAt,
          serviceProviderId: providerId,
        },
      ]);
    });

    it(`${route} (POST) should return 400 for an invalid rating`, async () => {
      const response = await postReview({ ...reviewBody(), rating: 6 }).expect(400);
      expect(response.body.message).toContain('rating must not be greater than 5');
      await expectNoReview();
    });

    it.each([
      { label: 'missing', value: undefined },
      { label: 'null', value: null },
      { label: 'zero', value: 0 },
      { label: 'negative', value: -1 },
      { label: 'fractional', value: 1.5 },
      { label: 'a string', value: '1' },
    ])(`${route} (POST) should return 400 when serviceRequestId is $label`, async ({ value }) => {
      const response = await postReview({ ...reviewBody(), serviceRequestId: value }).expect(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('serviceRequestId')]),
      );
      await expectNoReview();
    });

    it.each([
      { field: 'authorName', value: 'Auteur falsifié' },
      { field: 'requesterUserId', value: 999 },
      { field: 'serviceProviderId', value: 999 },
    ])(
      `${route} (POST) should reject the client-controlled field $field`,
      async ({ field, value }) => {
        const response = await postReview({ ...reviewBody(), [field]: value }).expect(400);
        expect(response.body.message).toContain(`property ${field} should not exist`);
        await expectNoReview();
      },
    );

    it(`${route} (POST) should return 404 for a missing provider`, async () => {
      await postReview(reviewBody(), requesterToken, 999).expect(404);
      await expectNoReview();
    });

    it(`${route} (POST) should return 404 for a missing request`, async () => {
      await postReview({ ...reviewBody(), serviceRequestId: 999 }).expect(404);
      await expectNoReview();
    });

    it(`${route} (POST) should return 404 when the request belongs to another provider`, async () => {
      const response = await postReview(reviewBody(), requesterToken, 2).expect(404);
      expect(response.body.message).toBe('Service request not found for this service provider');
      await expectNoReview();
    });

    it.each(['recipient', 'unrelated user'])(
      `${route} (POST) should forbid the %s from reviewing the request`,
      async (actor) => {
        const token =
          actor === 'recipient' ? ownerToken : await getAccessToken('other-reviewer@example.com');
        const response = await postReview(reviewBody(), token).expect(403);
        expect(response.body.message).toBe('Only the requester can review this service');
        await expectNoReview();
      },
    );

    it.each([
      ServiceRequestStatus.SENT,
      ServiceRequestStatus.READ,
      ServiceRequestStatus.ACCEPTED,
      ServiceRequestStatus.REJECTED,
    ])(`${route} (POST) should reject a request with status %s`, async (status) => {
      await requestsRepository.update(original.id, { status });
      const response = await postReview().expect(409);
      expect(response.body.message).toBe('Only completed service requests can be reviewed');
      expect(await reviewsRepository.count()).toBe(0);
      expect(await requestsRepository.findOneByOrFail({ id: original.id })).toEqual({
        ...original,
        status,
      });
    });

    it(`${route} (POST) should return 409 for an already reviewed request and preserve the original review`, async () => {
      const first = await postReview().expect(201);
      const originalReview = await reviewsRepository.findOneByOrFail({ id: first.body.id });
      const response = await postReview({
        ...reviewBody(),
        rating: 1,
        comment: 'Deuxième avis',
      }).expect(409);

      expect(response.body.message).toBe('This service request has already been reviewed');
      expect(await reviewsRepository.find()).toEqual([originalReview]);
    });

    it(`${route} (POST) should allow separate reviews for different completed requests to the same provider`, async () => {
      await postReview().expect(201);
      const secondRequest = await completeRequest();
      await postReview({ ...reviewBody(), serviceRequestId: secondRequest.id }).expect(201);

      const reviews = await reviewsRepository.find({ order: { id: 'ASC' } });
      expect(reviews.map((review) => review.serviceRequestId)).toEqual([
        original.id,
        secondRequest.id,
      ]);
      expect(reviews.every((review) => review.serviceProviderId === providerId)).toBe(true);
    });

    it(`${route} (POST) should return 409 when a competing review is inserted after the existence check`, async () => {
      const realExistsBy = reviewsRepository.existsBy.bind(reviewsRepository);
      const existenceCheck = vi
        .spyOn(reviewsRepository, 'existsBy')
        .mockImplementationOnce(async (criteria) => {
          const exists = await realExistsBy(criteria);
          expect(exists).toBe(false);
          await reviewsRepository.insert({
            ...reviewBody(),
            serviceProviderId: providerId,
            authorName: 'Bruno Leroy',
            comment: 'Avis concurrent conservé',
          });
          return exists;
        });

      try {
        const response = await postReview().expect(409);
        expect(response.body.message).toBe('This service request has already been reviewed');
        expect(existenceCheck).toHaveBeenCalledOnce();
        const stored = await reviewsRepository.find();
        expect(stored).toHaveLength(1);
        expect(stored[0]).toMatchObject({
          serviceRequestId: original.id,
          comment: 'Avis concurrent conservé',
        });
      } finally {
        existenceCheck.mockRestore();
      }
    });

    it(`${route} (POST) should allow reviewing a completed request after its offering is deleted`, async () => {
      await request(app.getHttpServer())
        .delete(`/service-providers/${providerId}/service-offerings/${offeringId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      await postReview().expect(201);
      expect(await requestsRepository.findOneByOrFail({ id: original.id })).toEqual({
        ...original,
        serviceOfferingId: null,
      });
      expect(await reviewsRepository.count()).toBe(1);
    });

    it(`${route} (POST) should not attach an old request to a recreated provider profile`, async () => {
      await request(app.getHttpServer())
        .delete(`/service-providers/${providerId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
      const recreated = await request(app.getHttpServer())
        .post('/service-providers')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          firstName: 'Alice',
          lastName: 'Martin',
          profession: 'Peintre',
          city: 'Paris',
          description: 'Nouvelle fiche.',
          hourlyRate: 35,
          available: true,
          imageUrl: '',
        })
        .expect(201);

      await postReview(reviewBody(), requesterToken, recreated.body.id).expect(404);
      expect(await reviewsRepository.count()).toBe(0);
      expect(await requestsRepository.findOneByOrFail({ id: original.id })).toEqual({
        ...original,
        serviceProviderId: null,
        serviceOfferingId: null,
      });
    });

    it.each(['invalid', 'expired'])(
      `${route} (POST) should reject an %s bearer token`,
      async (kind) => {
        const token =
          kind === 'invalid'
            ? 'invalid-token'
            : await app
                .get(JwtService)
                .signAsync({ sub: String(original.requesterUserId) }, { expiresIn: -1 });
        await postReview(reviewBody(), token).expect(401);
        await expectNoReview();
      },
    );

    it('/service-providers/:serviceProviderId/reviews/summary (GET) should return an empty summary', async () => {
      await request(app.getHttpServer())
        .get(`/service-providers/${providerId}/reviews/summary`)
        .expect(200)
        .expect({ reviewCount: 0, averageRating: null });
    });

    it('/service-providers/:serviceProviderId/reviews/summary (GET) should return a rounded average across distinct completed requests', async () => {
      for (const [index, rating] of [5, 4, 2].entries()) {
        const serviceRequest = index === 0 ? original : await completeRequest();
        await postReview({ ...reviewBody(), serviceRequestId: serviceRequest.id, rating }).expect(
          201,
        );
      }

      await request(app.getHttpServer())
        .get(`/service-providers/${providerId}/reviews/summary`)
        .expect(200)
        .expect({ reviewCount: 3, averageRating: 3.7 });
    });

    it(`${route} (GET) should preserve public access to legacy reviews without an associated request`, async () => {
      await reviewsRepository.save({
        authorName: 'Auteur historique',
        rating: 4,
        comment: 'Ancien avis',
        serviceProviderId: providerId,
        serviceRequestId: null,
      });

      const response = await request(app.getHttpServer())
        .get(`/service-providers/${providerId}/reviews`)
        .expect(200);

      expect(response.body).toEqual([
        {
          id: expect.any(Number),
          authorName: 'Auteur historique',
          rating: 4,
          comment: 'Ancien avis',
          createdAt: expect.any(String),
          serviceProviderId: providerId,
        },
      ]);
    });
  });

  it('/service-providers/999/reviews (GET) should return 404', () => {
    return request(app.getHttpServer()).get('/service-providers/999/reviews').expect(404).expect({
      message: 'Service provider with id 999 not found',
      error: 'Not Found',
      statusCode: 404,
    });
  });

  it('/service-providers/not-a-number/reviews (GET) should return 400', () => {
    return request(app.getHttpServer())
      .get('/service-providers/not-a-number/reviews')
      .expect(400)
      .expect({
        message: 'Validation failed (numeric string is expected)',
        error: 'Bad Request',
        statusCode: 400,
      });
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: 'ok',
          info: {
            database: {
              status: 'up',
              responseTime: expect.any(Number),
            },
          },
          error: {},
          details: {
            database: {
              status: 'up',
              responseTime: expect.any(Number),
            },
          },
        });
      });
  });

  it("/service-providers/:id/service-offerings (POST) should create an offering for the authenticated user's provider", async () => {
    const createServiceOfferingMock = {
      title: 'title',
      description: 'description',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 20,
    };
    const accessToken = await getAccessToken();
    const createdProviderResponse = await request(app.getHttpServer())
      .post('/service-providers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Julie',
        lastName: 'Durand',
        profession: 'Peintre',
        city: 'Marseille',
        description: 'Peinture intérieure et extérieure',
        hourlyRate: 35,
        available: true,
        imageUrl: '',
      })
      .expect(201);
    const serviceProviderId = createdProviderResponse.body.id;

    return request(app.getHttpServer())
      .post(`/service-providers/${serviceProviderId}/service-offerings`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createServiceOfferingMock)
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: 1,
          ...createServiceOfferingMock,
          serviceProviderId,
        });
      });
  });

  it("/service-providers/:id/service-offerings (POST) should reject creating an offering for another user's provider", async () => {
    const ownerToken = await getAccessToken();
    const otherUserToken = await getAccessToken('other-user@example.com');

    const createdProviderResponse = await request(app.getHttpServer())
      .post('/service-providers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        firstName: 'Julie',
        lastName: 'Durand',
        profession: 'Peintre',
        city: 'Marseille',
        description: 'Peinture intérieure et extérieure',
        hourlyRate: 35,
        available: true,
        imageUrl: '',
      })
      .expect(201);
    const serviceProviderId = createdProviderResponse.body.id;

    await request(app.getHttpServer())
      .post(`/service-providers/${serviceProviderId}/service-offerings`)
      .set('Authorization', `Bearer ${otherUserToken}`)
      .send({
        title: 'Peinture intérieure',
        description: 'Peinture des murs et plafonds',
        pricingType: ServicePricingType.HOURLY,
        hourlyRate: 35,
      })
      .expect(403)
      .expect((response) => {
        expect(response.body.message).toBe('You do not own this service provider profile');
      });

    await request(app.getHttpServer())
      .get(`/service-providers/${serviceProviderId}/service-offerings`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([]);
      });
  });

  it('/service-providers/:id/service-offerings (GET) should return hourly and free offerings without authentication', async () => {
    const createServiceOffering1 = {
      title: 'title1',
      description: 'description1',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 20,
    };
    const createServiceOffering2 = {
      title: 'title2',
      description: 'description2',
      pricingType: ServicePricingType.FREE,
    };
    const accessToken = await getAccessToken();
    const createdProviderResponse = await request(app.getHttpServer())
      .post('/service-providers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Julie',
        lastName: 'Durand',
        profession: 'Peintre',
        city: 'Marseille',
        description: 'Peinture intérieure et extérieure',
        hourlyRate: 35,
        available: true,
        imageUrl: '',
      })
      .expect(201);
    const serviceProviderId = createdProviderResponse.body.id;

    await request(app.getHttpServer())
      .post(`/service-providers/${serviceProviderId}/service-offerings`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createServiceOffering1)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/service-providers/${serviceProviderId}/service-offerings`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createServiceOffering2)
      .expect(201);

    return request(app.getHttpServer())
      .get(`/service-providers/${serviceProviderId}/service-offerings`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(2);
        expect(response.body[0]).toMatchObject({
          id: 1,
          ...createServiceOffering1,
          serviceProviderId,
        });
        expect(response.body[1]).toMatchObject({
          id: 2,
          ...createServiceOffering2,
          hourlyRate: null,
          serviceProviderId,
        });
      });
  });

  it('/service-providers/1/service-offerings (POST) should return 400 no hourlyRate', async () => {
    const createServiceOfferingMock = {
      title: 'title',
      description: 'description',
      pricingType: ServicePricingType.HOURLY,
    };
    const accessToken = await getAccessToken();

    return request(app.getHttpServer())
      .post('/service-providers/1/service-offerings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createServiceOfferingMock)
      .expect(400)
      .expect((response) => {
        expect(response.body.message).toContain('hourlyRate should not be null or undefined');
      });
  });

  it('/service-providers/:id/service-offerings (POST) should reject a free offering with an hourly rate', async () => {
    const createServiceOfferingMock = {
      title: 'title',
      description: 'description',
      pricingType: ServicePricingType.FREE,
      hourlyRate: 20,
    };
    const accessToken = await getAccessToken();
    const createdProviderResponse = await request(app.getHttpServer())
      .post('/service-providers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Julie',
        lastName: 'Durand',
        profession: 'Peintre',
        city: 'Marseille',
        description: 'Peinture intérieure et extérieure',
        hourlyRate: 35,
        available: true,
        imageUrl: '',
      })
      .expect(201);
    const serviceProviderId = createdProviderResponse.body.id;

    return request(app.getHttpServer())
      .post(`/service-providers/${serviceProviderId}/service-offerings`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(createServiceOfferingMock)
      .expect(400)
      .expect((response) => {
        expect(response.body.message).toContain(
          'A free service offering cannot have an hourly rate',
        );
      });
  });

  it('/service-providers/999/service-offerings (GET) should return 404', () => {
    return request(app.getHttpServer())
      .get('/service-providers/999/service-offerings')
      .expect(404)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'Service provider with id 999 not found',
          error: 'Not Found',
          statusCode: 404,
        });
      });
  });

  it('/auth/register (POST) creates a user', async () => {
    const authRegisterMock = {
      firstName: 'first',
      lastName: 'last',
      email: 'FIRSTNAME@EXAMPLE.COM',
      password: 'jesuisunmotdepassede15caractères',
    };

    await request(app.getHttpServer()).post('/auth/register').send(authRegisterMock).expect(201);

    const usersRepository = app.get<Repository<User>>(getRepositoryToken(User));
    const savedUser = await usersRepository.findOneBy({ email: 'firstname@example.com' });

    expect(savedUser).toMatchObject({
      firstName: 'first',
      lastName: 'last',
      email: 'firstname@example.com',
    });
  });

  it('/auth/register (POST) rejects a short password', async () => {
    const authRegisterMock = {
      firstName: 'first',
      lastName: 'last',
      email: 'FIRSTNAME2@EXAMPLE.COM',
      password: 'short',
    };

    await request(app.getHttpServer()).post('/auth/register').send(authRegisterMock).expect(400);

    const userRepository = app.get<Repository<User>>(getRepositoryToken(User));
    const savedUser = await userRepository.findOneBy({ email: 'firstname2@example.com' });

    expect(savedUser).toBeNull();
  });

  it('/auth/register (POST) rejects a user already created', async () => {
    const authRegisterMock = {
      firstName: 'first',
      lastName: 'last',
      email: 'FIRSTNAME3@EXAMPLE.COM',
      password: 'jesuisunmotdepassede15caractères',
    };

    await request(app.getHttpServer()).post('/auth/register').send(authRegisterMock).expect(201);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...authRegisterMock, email: 'firstname3@example.com' })
      .expect(409);

    const userRepository = app.get<Repository<User>>(getRepositoryToken(User));
    const savedUserCount = await userRepository.countBy({ email: 'firstname3@example.com' });

    expect(savedUserCount).toBe(1);
  });

  it('/auth/register (POST) create and get a new user', async () => {
    const authRegisterMock = {
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alicemartin@example.com',
      password: 'jesuisunmotdepassede15caractères',
    };

    await request(app.getHttpServer()).post('/auth/register').send(authRegisterMock).expect(201);

    const userSaved = await app
      .get<UsersService>(UsersService)
      .findByEmailWithPassword('   ALICEMARTIN@EXaMPLE.COM   ');

    expect(userSaved?.email).toBe('alicemartin@example.com');

    if (userSaved === null) throw new UnauthorizedException('Registered user not found');

    const passwordMatches = await argon2.verify(userSaved.passwordHash, authRegisterMock.password);

    expect(passwordMatches).toBe(true);
  });

  it('/auth/login (POST) returns a signed access token for valid credentials', async () => {
    const authRegisterMock = {
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'ALIcemartin@example.com',
      password: 'jesuisunmotdepassede15caractères',
    };

    await request(app.getHttpServer()).post('/auth/register').send(authRegisterMock).expect(201);
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'alicemartin@example.com', password: authRegisterMock.password })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ accessToken: expect.any(String) });
      });

    const jwtService = app.get(JwtService);
    const payload = await jwtService.verifyAsync<{ sub: string }>(response.body.accessToken);

    expect(payload.sub).toBe('1');
  });

  it('/auth/login (POST) rejects an incorrect password', async () => {
    const authRegisterMock = {
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'ALIcemartin@example.com',
      password: 'jesuisunmotdepassede15caractères',
    };

    await request(app.getHttpServer()).post('/auth/register').send(authRegisterMock).expect(201);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'alicemartin@example.com', password: 'wrongpassword123445678ç!èè' })
      .expect(401)
      .expect((response) => {
        expect(response.body.message).toBe('Invalid credentials');
      });
  });

  it('/auth/login (POST) rejects an incorrect email', async () => {
    const authRegisterMock = {
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'ALIcemartin@example.com',
      password: 'jesuisunmotdepassede15caractères',
    };

    await request(app.getHttpServer()).post('/auth/register').send(authRegisterMock).expect(201);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'alicemartin@example.co', password: authRegisterMock.password })
      .expect(401)
      .expect((response) => {
        expect(response.body.message).toBe('Invalid credentials');
      });
  });

  it('/auth/me (GET) should reject requests without a bearer token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('/auth/me (GET) should return the public profile with a valid token', async () => {
    const authRegisterMock = {
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'ALIcemartin@example.com',
      password: 'jesuisunmotdepassede15caractères',
    };

    await request(app.getHttpServer()).post('/auth/register').send(authRegisterMock).expect(201);
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: authRegisterMock.email, password: authRegisterMock.password })
      .expect(200);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200)
      .expect((meReponse) => {
        expect(meReponse.body).toEqual({
          id: 1,
          firstName: authRegisterMock.firstName,
          lastName: authRegisterMock.lastName,
          email: 'alicemartin@example.com',
        });
      });
  });

  it('/service-providers (POST) should reject requests without a bearer token', async () => {
    const createServiceProviderDto = {
      firstName: 'Julie',
      lastName: 'Durand',
      profession: 'Peintre',
      city: 'Marseille',
      description: 'Peinture intérieure et extérieure',
      hourlyRate: 35,
      available: true,
      imageUrl: '',
    };

    await request(app.getHttpServer())
      .post('/service-providers')
      .send(createServiceProviderDto)
      .expect(401);
  });

  it('/service-providers/1/service-offerings (POST) should reject requests without a bearer token', async () => {
    const createServiceOffering = {
      title: 'title1',
      description: 'description1',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 20,
    };

    await request(app.getHttpServer())
      .post('/service-providers/1/service-offerings')
      .send(createServiceOffering)
      .expect(401);
  });

  it('/service-providers/1 (PATCH) should reject requests without a bearer token', async () => {
    await request(app.getHttpServer())
      .patch('/service-providers/1')
      .send({ city: 'Nice' })
      .expect(401);
    await request(app.getHttpServer())
      .get('/service-providers/1')
      .expect(200)
      .expect((response) => {
        expect(response.body.city).toBe('Paris');
      });
  });

  it('/service-providers/1 (DELETE) should reject requests without a bearer token', async () => {
    await request(app.getHttpServer()).delete('/service-providers/1').expect(401);
    await request(app.getHttpServer()).get('/service-providers/1').expect(200);
  });

  it('/service-providers/1/reviews (POST) should reject requests without a bearer token', async () => {
    const review = { serviceRequestId: 41, rating: 5, comment: 'Test review' };

    await request(app.getHttpServer())
      .post('/service-providers/1/reviews')
      .send(review)
      .expect(401);
    await request(app.getHttpServer())
      .get('/service-providers/1/reviews')
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(0);
      });
  });

  describe('service offering updates and deletion', () => {
    let ownerToken: string;
    let providerId: number;
    let originalOffering: ServiceOffering;
    let offeringsRepository: Repository<ServiceOffering>;

    beforeEach(async () => {
      ownerToken = await getAccessToken();
      const providerResponse = await request(app.getHttpServer())
        .post('/service-providers')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          firstName: 'Alice',
          lastName: 'Martin',
          profession: 'Plombière',
          city: 'Paris',
          description: 'Installation et dépannage de plomberie.',
          hourlyRate: 35,
          available: true,
          imageUrl: '',
        })
        .expect(201);
      providerId = providerResponse.body.id;
      const offeringResponse = await request(app.getHttpServer())
        .post(`/service-providers/${providerId}/service-offerings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Conseil plomberie',
          description: 'Conseils pour entretenir votre installation.',
          pricingType: ServicePricingType.HOURLY,
          hourlyRate: 35,
        })
        .expect(201);
      originalOffering = offeringResponse.body;
      offeringsRepository = app.get<Repository<ServiceOffering>>(
        getRepositoryToken(ServiceOffering),
      );
    });

    function patchOffering(body: object) {
      return request(app.getHttpServer())
        .patch(`/service-providers/${providerId}/service-offerings/${originalOffering.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(body);
    }

    async function expectStoredOffering(expected: ServiceOffering = originalOffering) {
      expect(await offeringsRepository.findOneByOrFail({ id: originalOffering.id })).toEqual(
        expected,
      );
      const response = await request(app.getHttpServer())
        .get(`/service-providers/${providerId}/service-offerings`)
        .expect(200);
      expect(response.body).toEqual([expected]);
    }

    it('/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should update text while preserving omitted pricing fields', async () => {
      const update = { title: 'Nouveau titre', description: 'Description mise à jour.' };
      const response = await patchOffering(update);
      expect(response.status, JSON.stringify(response.body)).toBe(200);

      expect(response.body).toEqual({ ...originalOffering, ...update });
      await expectStoredOffering({ ...originalOffering, ...update });
    });

    it('/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should clear the rate when changing to free and accept a new rate when changing back to hourly', async () => {
      const freeOffering = {
        ...originalOffering,
        pricingType: ServicePricingType.FREE,
        hourlyRate: null,
      };
      const freeResponse = await patchOffering({ pricingType: ServicePricingType.FREE }).expect(
        200,
      );
      expect(freeResponse.body).toEqual(freeOffering);
      await expectStoredOffering(freeOffering);

      const hourlyOffering = { ...originalOffering, hourlyRate: 42 };
      const hourlyResponse = await patchOffering({
        pricingType: ServicePricingType.HOURLY,
        hourlyRate: 42,
      }).expect(200);
      expect(hourlyResponse.body).toEqual(hourlyOffering);
      await expectStoredOffering(hourlyOffering);
    });

    it('/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should accept an explicit null rate when changing to free', async () => {
      const update = { pricingType: ServicePricingType.FREE, hourlyRate: null };
      const response = await patchOffering(update).expect(200);
      expect(response.body).toEqual({ ...originalOffering, ...update });
      await expectStoredOffering({ ...originalOffering, ...update });
    });

    it('/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should update only the rate of an hourly offering', async () => {
      const response = await patchOffering({ hourlyRate: 0.01 }).expect(200);
      expect(response.body).toEqual({ ...originalOffering, hourlyRate: 0.01 });
      await expectStoredOffering({ ...originalOffering, hourlyRate: 0.01 });
    });

    it('/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should preserve free pricing when updating only the title', async () => {
      const freeOffering = {
        ...originalOffering,
        pricingType: ServicePricingType.FREE,
        hourlyRate: null,
      };
      await offeringsRepository.save(freeOffering);
      const response = await patchOffering({ title: 'Conseil gratuit' }).expect(200);
      const expected = { ...freeOffering, title: 'Conseil gratuit' };
      expect(response.body).toEqual(expected);
      await expectStoredOffering(expected);
    });

    it.each([
      { label: 'an omitted hourly rate', update: { pricingType: ServicePricingType.HOURLY } },
      {
        label: 'a null hourly rate',
        update: { pricingType: ServicePricingType.HOURLY, hourlyRate: null },
      },
    ])(
      '/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should reject changing to hourly with $label',
      async ({ update }) => {
        const freeOffering = {
          ...originalOffering,
          pricingType: ServicePricingType.FREE,
          hourlyRate: null,
        };
        await offeringsRepository.save(freeOffering);
        const response = await patchOffering(update).expect(400);
        expect(response.body.message).toBe('An hourly service offering requires an hourly rate');
        await expectStoredOffering(freeOffering);
      },
    );

    it('/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should reject a null rate when the offering remains hourly', async () => {
      const response = await patchOffering({ hourlyRate: null }).expect(400);
      expect(response.body.message).toBe('An hourly service offering requires an hourly rate');
      await expectStoredOffering();
    });

    it.each([ServicePricingType.HOURLY, ServicePricingType.FREE])(
      '/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should reject a rate on a free offering initially priced as %s',
      async (initialType) => {
        const initialOffering = {
          ...originalOffering,
          pricingType: initialType,
          hourlyRate: initialType === ServicePricingType.FREE ? null : 35,
        };
        await offeringsRepository.save(initialOffering);
        const update =
          initialType === ServicePricingType.FREE
            ? { hourlyRate: 20 }
            : { pricingType: ServicePricingType.FREE, hourlyRate: 20 };
        const response = await patchOffering(update).expect(400);
        expect(response.body.message).toBe('A free service offering cannot have an hourly rate');
        await expectStoredOffering(initialOffering);
      },
    );

    it.each([
      { label: 'a zero rate without pricingType', body: { hourlyRate: 0 }, field: 'hourlyRate' },
      {
        label: 'a negative rate without pricingType',
        body: { hourlyRate: -1 },
        field: 'hourlyRate',
      },
      {
        label: 'a string rate without pricingType',
        body: { hourlyRate: '42' },
        field: 'hourlyRate',
      },
      {
        label: 'a zero rate with HOURLY',
        body: { pricingType: ServicePricingType.HOURLY, hourlyRate: 0 },
        field: 'hourlyRate',
      },
      { label: 'an unknown pricing type', body: { pricingType: 'FIXED' }, field: 'pricingType' },
      { label: 'a null pricing type', body: { pricingType: null }, field: 'pricingType' },
      { label: 'an empty title', body: { title: '' }, field: 'title' },
      { label: 'a null title', body: { title: null }, field: 'title' },
      { label: 'a non-string title', body: { title: 42 }, field: 'title' },
      { label: 'an empty description', body: { description: '' }, field: 'description' },
      { label: 'a null description', body: { description: null }, field: 'description' },
      { label: 'a non-string description', body: { description: 42 }, field: 'description' },
      { label: 'an injected offering id', body: { id: 999 }, field: 'id' },
      {
        label: 'an injected provider id',
        body: { serviceProviderId: 2 },
        field: 'serviceProviderId',
      },
      { label: 'an injected owner id', body: { ownerUserId: 999 }, field: 'ownerUserId' },
    ])(
      '/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should reject $label without changing stored data',
      async ({ body, field }) => {
        const response = await patchOffering(body).expect(400);
        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringContaining(field)]),
        );
        await expectStoredOffering();
      },
    );

    it.each(['missing', 'invalid', 'expired'])(
      '/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should reject a %s bearer token without changing the offering',
      async (tokenKind) => {
        const pendingRequest = request(app.getHttpServer())
          .patch(`/service-providers/${providerId}/service-offerings/${originalOffering.id}`)
          .send({ title: 'Modification interdite' });
        if (tokenKind === 'invalid') pendingRequest.set('Authorization', 'Bearer invalid-token');
        if (tokenKind === 'expired') {
          const token = await app.get(JwtService).signAsync({ sub: 1 }, { expiresIn: -1 });
          pendingRequest.set('Authorization', `Bearer ${token}`);
        }
        await pendingRequest.expect(401);
        await expectStoredOffering();
      },
    );

    it('/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should forbid another user from modifying the offering', async () => {
      const otherToken = await getAccessToken('other-user@example.com');
      await request(app.getHttpServer())
        .patch(`/service-providers/${providerId}/service-offerings/${originalOffering.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ title: 'Modification interdite' })
        .expect(403);
      await expectStoredOffering();
    });

    it('/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should forbid modifying an offering on an ownerless provider', async () => {
      const legacyOffering = await offeringsRepository.save(
        offeringsRepository.create({
          title: 'Offre historique',
          description: 'Prestation gratuite.',
          pricingType: ServicePricingType.FREE,
          hourlyRate: null,
          serviceProviderId: 1,
        }),
      );
      await request(app.getHttpServer())
        .patch(`/service-providers/1/service-offerings/${legacyOffering.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Modification interdite' })
        .expect(403);
      expect(await offeringsRepository.findOneByOrFail({ id: legacyOffering.id })).toEqual(
        legacyOffering,
      );
    });

    it('/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should return 404 when the offering belongs to a different provider', async () => {
      const otherOffering = await offeringsRepository.save(
        offeringsRepository.create({
          title: 'Autre offre',
          description: 'Prestation gratuite.',
          pricingType: ServicePricingType.FREE,
          hourlyRate: null,
          serviceProviderId: 2,
        }),
      );
      await request(app.getHttpServer())
        .patch(`/service-providers/${providerId}/service-offerings/${otherOffering.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Modification interdite' })
        .expect(404);
      expect(await offeringsRepository.findOneByOrFail({ id: otherOffering.id })).toEqual(
        otherOffering,
      );
      await expectStoredOffering();
    });

    it.each([
      { label: 'a missing offering', provider: 'owned', offering: '999' },
      { label: 'a missing provider', provider: '999', offering: 'existing' },
    ])(
      '/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should return 404 for $label',
      async ({ provider, offering }) => {
        const targetProvider = provider === 'owned' ? providerId : provider;
        const targetOffering = offering === 'existing' ? originalOffering.id : offering;
        await request(app.getHttpServer())
          .patch(`/service-providers/${targetProvider}/service-offerings/${targetOffering}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ title: 'Nouveau titre' })
          .expect(404);
        await expectStoredOffering();
      },
    );

    it.each([
      { label: 'an invalid provider id', provider: 'invalid', offering: 'existing' },
      { label: 'an invalid offering id', provider: 'owned', offering: 'invalid' },
    ])(
      '/service-providers/:serviceProviderId/service-offerings/:id (PATCH) should return 400 for $label',
      async ({ provider, offering }) => {
        const targetProvider = provider === 'owned' ? providerId : provider;
        const targetOffering = offering === 'existing' ? originalOffering.id : offering;
        await request(app.getHttpServer())
          .patch(`/service-providers/${targetProvider}/service-offerings/${targetOffering}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ title: 'Nouveau titre' })
          .expect(400);
        await expectStoredOffering();
      },
    );

    it('/service-providers/:serviceProviderId/service-offerings/:id (DELETE) should delete only the selected offering and return no content', async () => {
      const sibling = await offeringsRepository.save(
        offeringsRepository.create({
          title: 'Conseil gratuit',
          description: 'Une autre prestation à conserver.',
          pricingType: ServicePricingType.FREE,
          hourlyRate: null,
          serviceProviderId: providerId,
        }),
      );
      const providerBefore = await request(app.getHttpServer())
        .get(`/service-providers/${providerId}`)
        .expect(200);

      const response = await request(app.getHttpServer())
        .delete(`/service-providers/${providerId}/service-offerings/${originalOffering.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      expect(response.text).toBe('');
      expect(await offeringsRepository.findOneBy({ id: originalOffering.id })).toBeNull();
      expect(await offeringsRepository.findOneByOrFail({ id: sibling.id })).toEqual(sibling);
      const list = await request(app.getHttpServer())
        .get(`/service-providers/${providerId}/service-offerings`)
        .expect(200);
      expect(list.body).toEqual([sibling]);
      const providerAfter = await request(app.getHttpServer())
        .get(`/service-providers/${providerId}`)
        .expect(200);
      expect(providerAfter.body).toEqual(providerBefore.body);
    });

    it.each(['missing', 'invalid', 'expired'])(
      '/service-providers/:serviceProviderId/service-offerings/:id (DELETE) should reject a %s bearer token without deleting the offering',
      async (tokenKind) => {
        const pendingRequest = request(app.getHttpServer()).delete(
          `/service-providers/${providerId}/service-offerings/${originalOffering.id}`,
        );
        if (tokenKind === 'invalid') pendingRequest.set('Authorization', 'Bearer invalid-token');
        if (tokenKind === 'expired') {
          const token = await app.get(JwtService).signAsync({ sub: '1' }, { expiresIn: -1 });
          pendingRequest.set('Authorization', `Bearer ${token}`);
        }
        await pendingRequest.expect(401);
        await expectStoredOffering();
      },
    );

    it('/service-providers/:serviceProviderId/service-offerings/:id (DELETE) should forbid another user from deleting the offering', async () => {
      const otherToken = await getAccessToken('other-user@example.com');
      await request(app.getHttpServer())
        .delete(`/service-providers/${providerId}/service-offerings/${originalOffering.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
      await expectStoredOffering();
    });

    it.each([
      { label: 'an offering on an ownerless provider', targetProvider: 'ownerless', status: 403 },
      {
        label: 'an offering belonging to a different provider',
        targetProvider: 'owned',
        status: 404,
      },
    ])(
      '/service-providers/:serviceProviderId/service-offerings/:id (DELETE) should reject deleting $label',
      async ({ targetProvider, status }) => {
        const foreignOffering = await offeringsRepository.save(
          offeringsRepository.create({
            title: 'Offre historique',
            description: 'Prestation gratuite.',
            pricingType: ServicePricingType.FREE,
            hourlyRate: null,
            serviceProviderId: 1,
          }),
        );
        const targetId = targetProvider === 'owned' ? providerId : 1;
        await request(app.getHttpServer())
          .delete(`/service-providers/${targetId}/service-offerings/${foreignOffering.id}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(status);
        expect(await offeringsRepository.findOneByOrFail({ id: foreignOffering.id })).toEqual(
          foreignOffering,
        );
        await expectStoredOffering();
      },
    );

    it.each([
      { label: 'a missing provider', provider: '999', offering: 'existing', status: 404 },
      { label: 'a missing offering', provider: 'owned', offering: '999', status: 404 },
      { label: 'an invalid provider id', provider: 'invalid', offering: 'existing', status: 400 },
      { label: 'an invalid offering id', provider: 'owned', offering: 'invalid', status: 400 },
    ])(
      '/service-providers/:serviceProviderId/service-offerings/:id (DELETE) should reject $label',
      async ({ provider, offering, status }) => {
        const targetProvider = provider === 'owned' ? providerId : provider;
        const targetOffering = offering === 'existing' ? originalOffering.id : offering;
        await request(app.getHttpServer())
          .delete(`/service-providers/${targetProvider}/service-offerings/${targetOffering}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(status);
        await expectStoredOffering();
      },
    );
  });

  describe('service request creation', () => {
    const route =
      '/service-providers/:serviceProviderId/service-offerings/:serviceOfferingId/service-requests';
    const message = 'Bonjour, je souhaite repeindre ma chambre.';
    let ownerToken: string;
    let requesterToken: string;
    let ownerId: number;
    let requesterId: number;
    let providerId: number;
    let offering: ServiceOffering;
    let requestsRepository: Repository<ServiceRequest>;
    let offeringsRepository: Repository<ServiceOffering>;

    beforeEach(async () => {
      ownerToken = await getAccessToken('owner@example.com');
      requesterToken = await getAccessToken('requester@example.com');
      const usersService = app.get(UsersService);
      ownerId = (await usersService.findByEmail('owner@example.com'))!.id;
      requesterId = (await usersService.findByEmail('requester@example.com'))!.id;
      await app.get<Repository<User>>(getRepositoryToken(User)).update(requesterId, {
        firstName: 'Bruno',
        lastName: 'Leroy',
      });
      const providerResponse = await request(app.getHttpServer())
        .post('/service-providers')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          firstName: 'Alice',
          lastName: 'Martin',
          profession: 'Peintre',
          city: 'Paris',
          description: 'Peinture intérieure.',
          hourlyRate: 35,
          available: true,
          imageUrl: '',
        })
        .expect(201);
      providerId = providerResponse.body.id;
      const offeringResponse = await request(app.getHttpServer())
        .post(`/service-providers/${providerId}/service-offerings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Peinture',
          description: 'Peinture intérieure.',
          pricingType: ServicePricingType.HOURLY,
          hourlyRate: 35,
        })
        .expect(201);
      offering = offeringResponse.body;
      requestsRepository = app.get<Repository<ServiceRequest>>(getRepositoryToken(ServiceRequest));
      offeringsRepository = app.get<Repository<ServiceOffering>>(
        getRepositoryToken(ServiceOffering),
      );
    });

    function url(provider: number | string = providerId, offer: number | string = offering.id) {
      return `/service-providers/${provider}/service-offerings/${offer}/service-requests`;
    }

    function sendRequest(body: object = { message }) {
      return request(app.getHttpServer())
        .post(url())
        .set('Authorization', `Bearer ${requesterToken}`)
        .send(body);
    }

    async function expectNoRequest() {
      expect(await requestsRepository.count()).toBe(0);
    }

    it.each([
      { pricingType: ServicePricingType.HOURLY, hourlyRate: 35 },
      { pricingType: ServicePricingType.FREE, hourlyRate: null },
    ])(
      `${route} (POST) should persist a SENT request with a $pricingType snapshot`,
      async (pricing) => {
        await offeringsRepository.update(offering.id, pricing);

        const response = await sendRequest().expect(201);

        expect(response.body).toEqual({
          id: expect.any(Number),
          message,
          status: ServiceRequestStatus.SENT,
          hasReview: false,
          createdAt: expect.any(String),
          requesterUserId: requesterId,
          recipientUserId: ownerId,
          serviceOfferingId: offering.id,
          serviceProviderId: providerId,
          offeringTitleSnapshot: offering.title,
          offeringPricingTypeSnapshot: pricing.pricingType,
          offeringHourlyRateSnapshot: pricing.hourlyRate,
          requester: { id: requesterId, firstName: 'Bruno', lastName: 'Leroy' },
          recipient: { id: ownerId, firstName: 'Alice', lastName: 'Martin' },
        });
        expect(Number.isNaN(Date.parse(response.body.createdAt))).toBe(false);
        const stored = await requestsRepository.findOneByOrFail({ id: response.body.id });
        const expectedStored = {
          ...response.body,
          serviceProviderId: providerId,
          createdAt: new Date(response.body.createdAt),
        };
        expect(stored.serviceProviderId).toBe(providerId);
        expect(providerId).not.toBe(ownerId);
        delete expectedStored.requester;
        delete expectedStored.recipient;
        delete expectedStored.hasReview;
        expect(stored).toEqual(expectedStored);
        expect(await requestsRepository.count()).toBe(1);
      },
    );

    it(`${route} (POST) should return the same safe response as sent and received lists`, async () => {
      const created = await sendRequest().expect(201);
      const sent = await request(app.getHttpServer())
        .get('/service-requests/sent')
        .set('Authorization', `Bearer ${requesterToken}`)
        .expect(200);
      const received = await request(app.getHttpServer())
        .get('/service-requests/received')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(sent.body).toEqual([created.body]);
      expect(received.body).toEqual([created.body]);
      expect(created.body.requester).toEqual({
        id: requesterId,
        firstName: 'Bruno',
        lastName: 'Leroy',
      });
      expect(created.body.recipient).toEqual({
        id: ownerId,
        firstName: 'Alice',
        lastName: 'Martin',
      });
      expect(created.body).not.toHaveProperty('requesterUser');
      expect(created.body).not.toHaveProperty('recipientUser');
      expect(created.body).not.toHaveProperty('email');
      expect(created.body).not.toHaveProperty('passwordHash');
    });

    it.each(['missing', 'invalid', 'expired'])(
      `${route} (POST) should reject a %s bearer token without creating a request`,
      async (kind) => {
        const pending = request(app.getHttpServer()).post(url()).send({ message });
        if (kind === 'invalid') pending.set('Authorization', 'Bearer invalid-token');
        if (kind === 'expired') {
          const token = await app
            .get(JwtService)
            .signAsync({ sub: String(requesterId) }, { expiresIn: -1 });
          pending.set('Authorization', `Bearer ${token}`);
        }

        await pending.expect(401);
        await expectNoRequest();
      },
    );

    it.each([
      { label: 'a missing message', body: {} },
      { label: 'a null message', body: { message: null } },
      { label: 'a numeric message', body: { message: 42 } },
      { label: 'an empty message', body: { message: '' } },
      { label: 'spaces only', body: { message: '   ' } },
      { label: 'line breaks and tabs only', body: { message: '\n\t' } },
    ])(`${route} (POST) should reject $label without creating a request`, async ({ body }) => {
      await sendRequest(body).expect(400);
      await expectNoRequest();
    });

    it(`${route} (POST) should reject client-supplied identities, snapshots and status`, async () => {
      const response = await sendRequest({
        message,
        requesterUserId: ownerId,
        recipientUserId: requesterId,
        serviceOfferingId: 999,
        serviceProviderId: 999,
        offeringTitleSnapshot: 'Faux titre',
        offeringPricingTypeSnapshot: ServicePricingType.FREE,
        offeringHourlyRateSnapshot: 1,
        status: 'ACCEPTED',
      }).expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          'property requesterUserId should not exist',
          'property recipientUserId should not exist',
          'property serviceOfferingId should not exist',
          'property serviceProviderId should not exist',
          'property offeringTitleSnapshot should not exist',
          'property offeringPricingTypeSnapshot should not exist',
          'property offeringHourlyRateSnapshot should not exist',
          'property status should not exist',
        ]),
      );
      await expectNoRequest();
    });

    it.each([
      { label: 'a missing provider', provider: '999', offer: 'existing', status: 404 },
      { label: 'a missing offering', provider: 'owned', offer: '999', status: 404 },
      { label: 'an invalid provider id', provider: 'invalid', offer: 'existing', status: 400 },
      { label: 'an invalid offering id', provider: 'owned', offer: 'invalid', status: 400 },
      {
        label: 'an offering belonging to a different provider',
        provider: '1',
        offer: 'existing',
        status: 404,
      },
    ])(
      `${route} (POST) should reject $label without creating a request`,
      async ({ provider, offer, status }) => {
        await request(app.getHttpServer())
          .post(
            url(
              provider === 'owned' ? providerId : provider,
              offer === 'existing' ? offering.id : offer,
            ),
          )
          .set('Authorization', `Bearer ${requesterToken}`)
          .send({ message })
          .expect(status);
        await expectNoRequest();
      },
    );

    it(`${route} (POST) should reject an offering on a provider without an owner`, async () => {
      const legacyOffering = await offeringsRepository.save(
        offeringsRepository.create({
          title: 'Conseil',
          description: 'Conseil gratuit.',
          pricingType: ServicePricingType.FREE,
          hourlyRate: null,
          serviceProviderId: 1,
        }),
      );

      const response = await request(app.getHttpServer())
        .post(url(1, legacyOffering.id))
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ message })
        .expect(409);

      expect(response.body.message).toBe('This service provider profile has no owner');
      await expectNoRequest();
    });

    it.each([
      { label: 'changing the hourly rate', update: { title: 'Nouveau titre', hourlyRate: 50 } },
      {
        label: 'changing to free',
        update: { title: 'Nouveau titre', pricingType: ServicePricingType.FREE },
      },
    ])(`${route} (POST) should preserve the original snapshot after $label`, async ({ update }) => {
      const response = await sendRequest().expect(201);
      const before = await requestsRepository.findOneByOrFail({ id: response.body.id });

      await request(app.getHttpServer())
        .patch(`/service-providers/${providerId}/service-offerings/${offering.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(update)
        .expect(200);

      expect(await requestsRepository.findOneByOrFail({ id: before.id })).toEqual(before);
      expect(await offeringsRepository.findOneByOrFail({ id: offering.id })).toMatchObject(update);
    });

    it.each(['offering', 'provider'])(
      `${route} (POST) should preserve the request when its %s is later deleted`,
      async (target) => {
        const response = await sendRequest().expect(201);
        const before = await requestsRepository.findOneByOrFail({ id: response.body.id });
        const deletionUrl =
          target === 'offering'
            ? `/service-providers/${providerId}/service-offerings/${offering.id}`
            : `/service-providers/${providerId}`;

        await request(app.getHttpServer())
          .delete(deletionUrl)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(204);

        expect(await offeringsRepository.findOneBy({ id: offering.id })).toBeNull();
        expect(await requestsRepository.findOneByOrFail({ id: before.id })).toEqual({
          ...before,
          serviceOfferingId: null,
          serviceProviderId: target === 'provider' ? null : providerId,
        });
        expect(await app.get(UsersService).findById(ownerId)).not.toBeNull();
        for (const [direction, token] of [
          ['sent', requesterToken],
          ['received', ownerToken],
        ]) {
          const list = await request(app.getHttpServer())
            .get(`/service-requests/${direction}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
          expect(list.body).toEqual([
            {
              ...response.body,
              serviceOfferingId: null,
              serviceProviderId: target === 'provider' ? null : providerId,
            },
          ]);
        }
      },
    );
    describe('conversation messages', () => {
      const route = '/service-requests/:id/messages';
      const content = '  Bonjour, disponible samedi ?\nMerci !  ';
      let original: ServiceRequest;
      let messagesRepository: Repository<ServiceRequestMessage>;

      beforeEach(async () => {
        const created = await sendRequest().expect(201);
        original = await requestsRepository.findOneByOrFail({ id: created.body.id });
        messagesRepository = app.get<Repository<ServiceRequestMessage>>(
          getRepositoryToken(ServiceRequestMessage),
        );
      });

      function postMessage(
        body: object = { content },
        token = requesterToken,
        id: number | string = original.id,
      ) {
        return request(app.getHttpServer())
          .post(`/service-requests/${id}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send(body);
      }

      async function expectNoMessage() {
        expect(await messagesRepository.count()).toBe(0);
        expect(await requestsRepository.findOneByOrFail({ id: original.id })).toEqual(original);
      }

      it.each(['requester', 'recipient'] as const)(
        `${route} (POST) should let the %s create an unread message and return only the saved message and safe author identity`,
        async (actor) => {
          const authorId = actor === 'requester' ? requesterId : ownerId;
          const token = actor === 'requester' ? requesterToken : ownerToken;
          const author =
            actor === 'requester'
              ? { id: requesterId, firstName: 'Bruno', lastName: 'Leroy' }
              : { id: ownerId, firstName: 'Alice', lastName: 'Martin' };
          // Force message and account identifiers to differ, preventing accidental reads by author id.
          const previous = await messagesRepository.save({
            id: 100,
            content: 'Message précédent',
            serviceRequestId: original.id,
            authorUserId: requesterId,
            readAt: new Date('2026-10-22T09:00:00.000Z'),
          });

          const response = await postMessage({ content }, token).expect(201);

          expect(response.body).toEqual({
            id: 101,
            content,
            serviceRequestId: original.id,
            authorUserId: authorId,
            createdAt: expect.any(String),
            readAt: null,
            author,
          });
          expect(Number.isNaN(Date.parse(response.body.createdAt))).toBe(false);
          expect(await messagesRepository.findOneByOrFail({ id: response.body.id })).toEqual({
            id: 101,
            content,
            serviceRequestId: original.id,
            authorUserId: authorId,
            createdAt: new Date(response.body.createdAt),
            readAt: null,
          });
          expect(await messagesRepository.findOneByOrFail({ id: previous.id })).toEqual(previous);
          expect(await messagesRepository.count()).toBe(2);
          expect(await requestsRepository.findOneByOrFail({ id: original.id })).toEqual(original);
        },
      );

      it(`${route} (POST) should accept a message at the maximum length of 2000 characters`, async () => {
        const content = 'x'.repeat(2000);

        const response = await postMessage({ content }).expect(201);

        expect(response.body.content).toBe(content);
        expect(response.body.readAt).toBeNull();
        expect(await messagesRepository.count()).toBe(1);
      });

      it.each([
        { label: 'missing content', body: {} },
        { label: 'empty content', body: { content: '' } },
        { label: 'whitespace-only content', body: { content: ' \t\n ' } },
        { label: 'null content', body: { content: null } },
        { label: 'numeric content', body: { content: 42 } },
        { label: 'array content', body: { content: ['Bonjour'] } },
        { label: 'object content', body: { content: { text: 'Bonjour' } } },
        { label: 'content longer than 2000 characters', body: { content: 'x'.repeat(2001) } },
      ])(`${route} (POST) should reject $label without writing a message`, async ({ body }) => {
        await postMessage(body).expect(400);

        await expectNoMessage();
      });

      it.each([
        { field: 'authorUserId', value: 999 },
        { field: 'serviceRequestId', value: 999 },
        { field: 'id', value: 999 },
        { field: 'createdAt', value: '2000-01-01T00:00:00.000Z' },
        { field: 'readAt', value: '2000-01-01T00:00:00.000Z' },
        { field: 'author', value: { id: 999, firstName: 'Forged', lastName: 'Author' } },
      ])(`${route} (POST) should reject a client-supplied $field`, async ({ field, value }) => {
        const response = await postMessage({ content, [field]: value }).expect(400);

        expect(response.body.message).toContain(`property ${field} should not exist`);
        await expectNoMessage();
      });

      it.each(['missing', 'invalid', 'expired'])(
        `${route} (POST) should reject a %s bearer token without writing a message`,
        async (kind) => {
          const pending = request(app.getHttpServer())
            .post(`/service-requests/${original.id}/messages`)
            .send({ content });
          if (kind === 'invalid') pending.set('Authorization', 'Bearer invalid-token');
          if (kind === 'expired') {
            const token = await app
              .get(JwtService)
              .signAsync({ sub: String(requesterId) }, { expiresIn: -1 });
            pending.set('Authorization', `Bearer ${token}`);
          }
          await pending.expect(401);
          await expectNoMessage();
        },
      );

      it.each([
        { id: 'not-a-number', expected: 400 },
        { id: '1.5', expected: 400 },
        { id: '999999', expected: 404 },
      ])(
        `${route} (POST) should return $expected for request id $id without writing a message`,
        async ({ id, expected }) => {
          await postMessage({ content }, requesterToken, id).expect(expected);

          await expectNoMessage();
        },
      );

      it(`${route} (POST) should forbid an unrelated authenticated account from writing to the conversation`, async () => {
        const otherToken = await getAccessToken('message-outsider@example.com');

        const response = await postMessage({ content }, otherToken).expect(403);

        expect(response.body.message).toBe(
          'Only request participants can access this conversation',
        );
        await expectNoMessage();
      });

      it.each(['offering', 'provider'] as const)(
        `${route} (POST) should preserve discussion access for recorded participants after %s deletion`,
        async (target) => {
          const first = await postMessage().expect(201);
          await request(app.getHttpServer())
            .delete(
              target === 'offering'
                ? `/service-providers/${providerId}/service-offerings/${offering.id}`
                : `/service-providers/${providerId}`,
            )
            .set('Authorization', `Bearer ${ownerToken}`)
            .expect(204);

          const response = await postMessage(
            { content: 'La discussion reste accessible.' },
            ownerToken,
          ).expect(201);

          expect(response.body).toMatchObject({
            serviceRequestId: original.id,
            authorUserId: ownerId,
            readAt: null,
          });
          expect(await messagesRepository.count()).toBe(2);
          expect(await messagesRepository.findOneByOrFail({ id: first.body.id })).toMatchObject({
            content,
            readAt: null,
          });
          expect(await requestsRepository.findOneByOrFail({ id: original.id })).toEqual({
            ...original,
            serviceOfferingId: null,
            serviceProviderId: target === 'provider' ? null : providerId,
          });
        },
      );

      async function seedHistory() {
        const other = await sendRequest({ message: 'Autre discussion privée' }).expect(201);
        const at = new Date('2026-10-22T10:00:00.000Z');
        const later = new Date('2026-10-22T11:00:00.000Z');
        const readAt = new Date('2026-10-22T10:30:00.000Z');
        await messagesRepository.save([
          {
            id: 103,
            content: 'Dernière réponse',
            serviceRequestId: original.id,
            authorUserId: ownerId,
            createdAt: later,
            readAt: null,
          },
          {
            id: 102,
            content: 'Deuxième au même instant',
            serviceRequestId: original.id,
            authorUserId: requesterId,
            createdAt: at,
            readAt: null,
          },
          {
            id: 101,
            content: 'Première au même instant',
            serviceRequestId: original.id,
            authorUserId: ownerId,
            createdAt: at,
            readAt,
          },
          {
            id: 104,
            content: 'Message réservé à une autre discussion',
            serviceRequestId: other.body.id,
            authorUserId: requesterId,
            createdAt: at,
            readAt: null,
          },
        ]);
        return {
          otherId: other.body.id,
          snapshot: await messagesRepository.find({ order: { id: 'ASC' } }),
          expected: [
            {
              id: 101,
              content: 'Première au même instant',
              serviceRequestId: original.id,
              authorUserId: ownerId,
              createdAt: at.toISOString(),
              readAt: readAt.toISOString(),
              author: { id: ownerId, firstName: 'Alice', lastName: 'Martin' },
            },
            {
              id: 102,
              content: 'Deuxième au même instant',
              serviceRequestId: original.id,
              authorUserId: requesterId,
              createdAt: at.toISOString(),
              readAt: null,
              author: { id: requesterId, firstName: 'Bruno', lastName: 'Leroy' },
            },
            {
              id: 103,
              content: 'Dernière réponse',
              serviceRequestId: original.id,
              authorUserId: ownerId,
              createdAt: later.toISOString(),
              readAt: null,
              author: { id: ownerId, firstName: 'Alice', lastName: 'Martin' },
            },
          ],
        };
      }

      function getMessages(token = requesterToken, id: number | string = original.id) {
        return request(app.getHttpServer())
          .get(`/service-requests/${id}/messages`)
          .set('Authorization', `Bearer ${token}`);
      }

      it.each(['requester', 'recipient'] as const)(
        `${route} (GET) should let the %s read only this conversation in date and id order without changing read dates or exposing private fields`,
        async (actor) => {
          const history = await seedHistory();
          const token = actor === 'requester' ? requesterToken : ownerToken;

          for (let read = 0; read < 2; read++) {
            const response = await getMessages(token).expect(200);
            expect(response.body).toEqual(history.expected);
          }

          expect(await messagesRepository.find({ order: { id: 'ASC' } })).toEqual(history.snapshot);
          expect(await requestsRepository.findOneByOrFail({ id: original.id })).toEqual(original);
        },
      );

      it(`${route} (GET) should return an empty array when the accessible request has no replies`, async () => {
        const response = await getMessages().expect(200);

        expect(response.body).toEqual([]);
        await expectNoMessage();
      });

      it.each([false, true])(
        `${route} (GET) should forbid an unrelated account regardless of whether the conversation contains messages (%s)`,
        async (withMessage) => {
          if (withMessage) await postMessage().expect(201);
          const before = await messagesRepository.find();
          const token = await getAccessToken('message-reader-outsider@example.com');

          const response = await getMessages(token).expect(403);

          expect(response.body.message).toBe(
            'Only request participants can access this conversation',
          );
          expect(await messagesRepository.find()).toEqual(before);
          expect(await requestsRepository.findOneByOrFail({ id: original.id })).toEqual(original);
        },
      );

      it.each(['missing', 'invalid', 'expired'])(
        `${route} (GET) should reject a %s bearer token without modifying message read dates`,
        async (kind) => {
          await postMessage().expect(201);
          const before = await messagesRepository.find();
          const pending = request(app.getHttpServer()).get(
            `/service-requests/${original.id}/messages`,
          );
          if (kind === 'invalid') pending.set('Authorization', 'Bearer invalid-token');
          if (kind === 'expired') {
            const token = await app
              .get(JwtService)
              .signAsync({ sub: String(requesterId) }, { expiresIn: -1 });
            pending.set('Authorization', `Bearer ${token}`);
          }

          await pending.expect(401);

          expect(await messagesRepository.find()).toEqual(before);
        },
      );

      it.each([
        { id: 'not-a-number', expected: 400 },
        { id: '1.5', expected: 400 },
        { id: '999999', expected: 404 },
      ])(`${route} (GET) should return $expected for request id $id`, async ({ id, expected }) => {
        await getMessages(requesterToken, id).expect(expected);

        await expectNoMessage();
      });

      it(`${route} (GET) should ignore client-supplied conversation and account query filters`, async () => {
        const history = await seedHistory();

        const response = await getMessages()
          .query({
            serviceRequestId: history.otherId,
            authorUserId: 999,
            userId: 999,
          })
          .expect(200);

        expect(response.body).toEqual(history.expected);
        expect(await messagesRepository.find({ order: { id: 'ASC' } })).toEqual(history.snapshot);
      });

      it.each(['offering', 'provider'] as const)(
        `${route} (GET) should preserve history access for both participants after %s deletion`,
        async (target) => {
          const history = await seedHistory();
          await request(app.getHttpServer())
            .delete(
              target === 'offering'
                ? `/service-providers/${providerId}/service-offerings/${offering.id}`
                : `/service-providers/${providerId}`,
            )
            .set('Authorization', `Bearer ${ownerToken}`)
            .expect(204);

          for (const token of [requesterToken, ownerToken]) {
            const response = await getMessages(token).expect(200);
            expect(response.body).toEqual(history.expected);
          }
          expect(await messagesRepository.find({ order: { id: 'ASC' } })).toEqual(history.snapshot);
        },
      );

      it(`${route} (GET) should return newly posted replies from both participants without marking either as read`, async () => {
        await getMessages().expect(200).expect([]);
        const first = await postMessage({ content: 'Bonjour, samedi ?' }).expect(201);
        const second = await postMessage({ content: 'Oui, samedi matin.' }, ownerToken).expect(201);

        for (const token of [requesterToken, ownerToken]) {
          const response = await getMessages(token).expect(200);
          expect(response.body).toEqual([first.body, second.body]);
          expect(
            response.body.every((message: { readAt: string | null }) => message.readAt === null),
          ).toBe(true);
        }
        expect(await requestsRepository.findOneByOrFail({ id: original.id })).toEqual(original);
      });

      describe('conversation read receipts', () => {
        const readRoute = '/service-requests/:id/messages/read';

        function markRead(
          body: object = { upToMessageId: 105 },
          token = requesterToken,
          id: number | string = original.id,
        ) {
          return request(app.getHttpServer())
            .patch(`/service-requests/${id}/messages/read`)
            .set('Authorization', `Bearer ${token}`)
            .send(body);
        }

        async function seedReadHistory(reader: 'requester' | 'recipient' = 'requester') {
          const readerId = reader === 'requester' ? requesterId : ownerId;
          const senderId = reader === 'requester' ? ownerId : requesterId;
          const token = reader === 'requester' ? requesterToken : ownerToken;
          const other = await sendRequest({
            message: 'Autre discussion pour vérifier le filtre',
          }).expect(201);
          const createdAt = new Date('2026-10-22T08:00:00.000Z');
          const alreadyReadAt = new Date('2026-10-22T08:30:00.000Z');
          await messagesRepository.save([
            {
              id: 101,
              content: 'Reçu non lu avant la limite',
              serviceRequestId: original.id,
              authorUserId: senderId,
              createdAt,
              readAt: null,
            },
            {
              id: 102,
              content: 'Mon propre message',
              serviceRequestId: original.id,
              authorUserId: readerId,
              createdAt,
              readAt: null,
            },
            {
              id: 103,
              content: 'Reçu déjà lu',
              serviceRequestId: original.id,
              authorUserId: senderId,
              createdAt,
              readAt: alreadyReadAt,
            },
            {
              id: 104,
              content: 'Autre discussion sous la limite',
              serviceRequestId: other.body.id,
              authorUserId: senderId,
              createdAt,
              readAt: null,
            },
            {
              id: 105,
              content: 'Reçu à la limite',
              serviceRequestId: original.id,
              authorUserId: senderId,
              createdAt,
              readAt: null,
            },
            {
              id: 106,
              content: 'Reçu après la limite',
              serviceRequestId: original.id,
              authorUserId: senderId,
              createdAt,
              readAt: null,
            },
            {
              id: 107,
              content: 'Mon message après la limite',
              serviceRequestId: original.id,
              authorUserId: readerId,
              createdAt,
              readAt: null,
            },
          ]);
          return {
            token,
            readerId,
            otherId: other.body.id,
            snapshot: await messagesRepository.find({ order: { id: 'ASC' } }),
          };
        }

        async function expectUnchanged(snapshot: ServiceRequestMessage[]) {
          expect(await messagesRepository.find({ order: { id: 'ASC' } })).toEqual(snapshot);
          expect(await requestsRepository.findOneByOrFail({ id: original.id })).toEqual(original);
        }

        it.each(['requester', 'recipient'] as const)(
          `${readRoute} (PATCH) should let the %s mark only unread received messages through the boundary and preserve all other data`,
          async (reader) => {
            const history = await seedReadHistory(reader);
            const startedAt = Date.now();

            const response = await markRead({ upToMessageId: 105 }, history.token).expect(204);

            expect(response.text).toBe('');
            const after = await messagesRepository.find({ order: { id: 'ASC' } });
            for (let index = 0; index < after.length; index++) {
              const row = after[index];
              if ([101, 105].includes(row.id)) {
                expect(row).toEqual({ ...history.snapshot[index], readAt: expect.any(Date) });
                expect(row.readAt!.getTime()).toBeGreaterThanOrEqual(startedAt);
                expect(row.readAt!.getTime()).toBeLessThanOrEqual(Date.now());
              } else {
                expect(row).toEqual(history.snapshot[index]);
              }
            }
            expect(after.find((row) => row.id === 101)!.readAt).toEqual(
              after.find((row) => row.id === 105)!.readAt,
            );
            expect(await requestsRepository.findOneByOrFail({ id: original.id })).toEqual(original);
            const visible = await getMessages(history.token).expect(200);
            expect(visible.body.find((message: { id: number }) => message.id === 101).readAt).toBe(
              after[0].readAt!.toISOString(),
            );
            expect(
              visible.body.find((message: { id: number }) => message.id === 106).readAt,
            ).toBeNull();

            await markRead({ upToMessageId: 105 }, history.token).expect(204);
            expect(await messagesRepository.find({ order: { id: 'ASC' } })).toEqual(after);
          },
        );

        it(`${readRoute} (PATCH) should accept an own-message boundary while marking only earlier received messages`, async () => {
          const history = await seedReadHistory();

          await markRead({ upToMessageId: 102 }).expect(204);

          const after = await messagesRepository.find({ order: { id: 'ASC' } });
          expect(after[0]).toEqual({ ...history.snapshot[0], readAt: expect.any(Date) });
          expect(after.slice(1)).toEqual(history.snapshot.slice(1));
        });

        it(`${readRoute} (PATCH) should return 204 when the valid boundary has no unread received messages to update`, async () => {
          const created = await postMessage({ content: 'Mon message uniquement' }).expect(201);
          const before = await messagesRepository.find();

          const response = await markRead({ upToMessageId: created.body.id }).expect(204);

          expect(response.text).toBe('');
          await expectUnchanged(before);
        });

        it(`${readRoute} (PATCH) should leave a message arriving after the displayed history unread`, async () => {
          const first = await postMessage({ content: 'Premier message reçu' }, ownerToken).expect(
            201,
          );
          const displayed = await getMessages().expect(200);
          const boundary = Math.max(...displayed.body.map((message: { id: number }) => message.id));
          const later = await postMessage({ content: 'Message arrivé ensuite' }, ownerToken).expect(
            201,
          );

          await markRead({ upToMessageId: boundary }).expect(204);

          expect(
            (await messagesRepository.findOneByOrFail({ id: first.body.id })).readAt,
          ).toBeInstanceOf(Date);
          expect(
            (await messagesRepository.findOneByOrFail({ id: later.body.id })).readAt,
          ).toBeNull();
        });

        it(`${readRoute} (PATCH) should refuse a boundary belonging to another conversation`, async () => {
          const history = await seedReadHistory();

          const response = await markRead({ upToMessageId: 104 }).expect(404);

          expect(response.body.message).toBe('Message not found in this conversation');
          await expectUnchanged(history.snapshot);
        });

        it(`${readRoute} (PATCH) should refuse a nonexistent message boundary`, async () => {
          const history = await seedReadHistory();

          await markRead({ upToMessageId: 999999 }).expect(404);

          await expectUnchanged(history.snapshot);
        });

        it(`${readRoute} (PATCH) should forbid an unrelated account from marking the conversation as read`, async () => {
          const history = await seedReadHistory();
          const token = await getAccessToken('read-receipt-outsider@example.com');

          await markRead({ upToMessageId: 105 }, token).expect(403);

          await expectUnchanged(history.snapshot);
        });

        it.each([
          { label: 'missing boundary', body: {} },
          { label: 'zero boundary', body: { upToMessageId: 0 } },
          { label: 'negative boundary', body: { upToMessageId: -1 } },
          { label: 'fractional boundary', body: { upToMessageId: 1.5 } },
          { label: 'numeric string boundary', body: { upToMessageId: '105' } },
          { label: 'null boundary', body: { upToMessageId: null } },
          { label: 'boolean boundary', body: { upToMessageId: true } },
          { label: 'array boundary', body: { upToMessageId: [105] } },
          { label: 'object boundary', body: { upToMessageId: { id: 105 } } },
        ])(
          `${readRoute} (PATCH) should reject $label without changing messages`,
          async ({ body }) => {
            const history = await seedReadHistory();

            await markRead(body).expect(400);

            await expectUnchanged(history.snapshot);
          },
        );

        it.each([
          { field: 'readAt', value: '2000-01-01T00:00:00.000Z' },
          { field: 'authorUserId', value: 999 },
          { field: 'serviceRequestId', value: 999 },
        ])(
          `${readRoute} (PATCH) should reject a client-supplied $field`,
          async ({ field, value }) => {
            const history = await seedReadHistory();

            const response = await markRead({ upToMessageId: 105, [field]: value }).expect(400);

            expect(response.body.message).toContain(`property ${field} should not exist`);
            await expectUnchanged(history.snapshot);
          },
        );

        it.each(['missing', 'invalid', 'expired'])(
          `${readRoute} (PATCH) should reject a %s bearer token without changing messages`,
          async (kind) => {
            const history = await seedReadHistory();
            const pending = request(app.getHttpServer())
              .patch(`/service-requests/${original.id}/messages/read`)
              .send({ upToMessageId: 105 });
            if (kind === 'invalid') pending.set('Authorization', 'Bearer invalid-token');
            if (kind === 'expired') {
              const token = await app
                .get(JwtService)
                .signAsync({ sub: String(requesterId) }, { expiresIn: -1 });
              pending.set('Authorization', `Bearer ${token}`);
            }

            await pending.expect(401);

            await expectUnchanged(history.snapshot);
          },
        );

        it.each([
          { id: 'not-a-number', expected: 400 },
          { id: '1.5', expected: 400 },
          { id: '999999', expected: 404 },
        ])(
          `${readRoute} (PATCH) should return $expected for request id $id`,
          async ({ id, expected }) => {
            const history = await seedReadHistory();

            await markRead({ upToMessageId: 105 }, requesterToken, id).expect(expected);

            await expectUnchanged(history.snapshot);
          },
        );

        it.each(['offering', 'provider'] as const)(
          `${readRoute} (PATCH) should preserve read access for recorded participants after %s deletion`,
          async (target) => {
            await seedReadHistory();
            await request(app.getHttpServer())
              .delete(
                target === 'offering'
                  ? `/service-providers/${providerId}/service-offerings/${offering.id}`
                  : `/service-providers/${providerId}`,
              )
              .set('Authorization', `Bearer ${ownerToken}`)
              .expect(204);

            await markRead({ upToMessageId: 105 }).expect(204);

            expect((await messagesRepository.findOneByOrFail({ id: 101 })).readAt).toBeInstanceOf(
              Date,
            );
            expect((await messagesRepository.findOneByOrFail({ id: 102 })).readAt).toBeNull();
            expect((await messagesRepository.findOneByOrFail({ id: 106 })).readAt).toBeNull();
            expect((await requestsRepository.findOneByOrFail({ id: original.id })).status).toBe(
              original.status,
            );
          },
        );

        it(`${readRoute} (GET) should not expose a route that mutates message read dates`, async () => {
          const history = await seedReadHistory();

          await request(app.getHttpServer())
            .get(`/service-requests/${original.id}/messages/read`)
            .set('Authorization', `Bearer ${requesterToken}`)
            .send({ upToMessageId: 105 })
            .expect(404);

          await expectUnchanged(history.snapshot);
        });

        it(`${readRoute} (PATCH) should document an authenticated 204 response without content and the positive integer boundary`, () => {
          const document = SwaggerModule.createDocument(
            app,
            new DocumentBuilder().addBearerAuth().build(),
          );
          const path = document.paths['/service-requests/{id}/messages/read'];
          expect(path.get).toBeUndefined();
          const operation = path.patch!;
          expect(operation.responses['204']).toBeDefined();
          expect(operation.responses['204']).not.toHaveProperty('content');
          expect(operation.responses).not.toHaveProperty('200');
          for (const status of ['400', '401', '403', '404'])
            expect(operation.responses).toHaveProperty(status);
          expect(operation.security).toEqual(expect.arrayContaining([{ bearer: [] }]));
          expect(document.components!.schemas!.MarkServiceRequestMessagesReadDto).toMatchObject({
            required: ['upToMessageId'],
            properties: { upToMessageId: { type: 'number', minimum: 1 } },
          });
        });
      });

      it(`${route} (GET) should document an authenticated 200 array response and its access errors in Swagger`, () => {
        const document = SwaggerModule.createDocument(
          app,
          new DocumentBuilder().addBearerAuth().build(),
        );
        const operation = document.paths['/service-requests/{id}/messages'].get!;

        expect(operation.responses['200']).toMatchObject({
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/ServiceRequestMessageResponseDto' },
              },
            },
          },
        });
        expect(operation.responses).not.toHaveProperty('201');
        for (const status of ['400', '401', '403', '404'])
          expect(operation.responses).toHaveProperty(status);
        expect(operation.security).toEqual(expect.arrayContaining([{ bearer: [] }]));
      });

      it(`${route} (POST) should document its 201 response and content validation in Swagger`, () => {
        const document = SwaggerModule.createDocument(
          app,
          new DocumentBuilder().addBearerAuth().build(),
        );
        const operation = document.paths['/service-requests/{id}/messages'].post!;

        expect(operation.responses).toHaveProperty('201');
        expect(operation.responses).not.toHaveProperty('200');
        expect(operation.responses['201']).toMatchObject({
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ServiceRequestMessageResponseDto' },
            },
          },
        });
        expect(operation.responses).toHaveProperty('400');
        expect(operation.responses).toHaveProperty('401');
        expect(operation.responses).toHaveProperty('403');
        expect(operation.responses).toHaveProperty('404');
        expect(operation.security).toEqual(expect.arrayContaining([{ bearer: [] }]));
        expect(document.components!.schemas!.CreateServiceRequestMessageDto).toMatchObject({
          required: ['content'],
          properties: { content: { type: 'string', minLength: 1, maxLength: 2000 } },
        });
      });
    });
  });

  describe('unread conversation message counts', () => {
    const route = '/service-requests/messages/unread-counts';
    let tokens: Record<'A' | 'B' | 'C', string>;
    let userIds: Record<'A' | 'B' | 'C', number>;
    let requests: ServiceRequest[];
    let messages: ServiceRequestMessage[];
    let requestsRepository: Repository<ServiceRequest>;
    let messagesRepository: Repository<ServiceRequestMessage>;
    let offeringId: number;

    beforeEach(async () => {
      tokens = {
        A: await getAccessToken('counts-a@example.com'),
        B: await getAccessToken('counts-b@example.com'),
        C: await getAccessToken('counts-c@example.com'),
      };
      const usersService = app.get(UsersService);
      userIds = {
        A: (await usersService.findByEmail('counts-a@example.com'))!.id,
        B: (await usersService.findByEmail('counts-b@example.com'))!.id,
        C: (await usersService.findByEmail('counts-c@example.com'))!.id,
      };
      const providers = app.get<Repository<ServiceProvider>>(getRepositoryToken(ServiceProvider));
      await providers.update(1, { ownerUserId: userIds.B });
      const offerings = app.get<Repository<ServiceOffering>>(getRepositoryToken(ServiceOffering));
      const offering = await offerings.save(
        offerings.create({
          title: 'Conseil',
          description: 'Conseil de démonstration',
          pricingType: ServicePricingType.FREE,
          hourlyRate: null,
          serviceProviderId: 1,
        }),
      );
      offeringId = offering.id;
      requestsRepository = app.get<Repository<ServiceRequest>>(getRepositoryToken(ServiceRequest));
      messagesRepository = app.get<Repository<ServiceRequestMessage>>(
        getRepositoryToken(ServiceRequestMessage),
      );
      requests = await requestsRepository.save(
        [
          { from: userIds.A, to: userIds.B, status: ServiceRequestStatus.ACCEPTED },
          { from: userIds.B, to: userIds.A, status: ServiceRequestStatus.COMPLETED },
          { from: userIds.B, to: userIds.C, status: ServiceRequestStatus.REJECTED },
          { from: userIds.A, to: userIds.C, status: ServiceRequestStatus.SENT },
          { from: userIds.C, to: userIds.A, status: ServiceRequestStatus.READ },
        ].map((entry, index) =>
          requestsRepository.create({
            message: `Texte initial privé ${index}`,
            requesterUserId: entry.from,
            recipientUserId: entry.to,
            status: entry.status,
            serviceProviderId: index === 0 ? 1 : null,
            serviceOfferingId: index === 0 ? offeringId : null,
            offeringTitleSnapshot: 'Conseil historique',
            offeringPricingTypeSnapshot: ServicePricingType.FREE,
            offeringHourlyRateSnapshot: null,
          }),
        ),
      );
      const reply = (requestIndex: number, authorUserId: number, read = false) =>
        messagesRepository.create({
          serviceRequestId: requests[requestIndex].id,
          authorUserId,
          content: `Réponse privée ${requestIndex} de ${authorUserId}`,
          readAt: read ? new Date('2026-10-23T09:10:00.000Z') : null,
        });
      messages = await messagesRepository.save([
        reply(0, userIds.B),
        reply(0, userIds.B),
        reply(0, userIds.A),
        reply(0, userIds.B, true),
        reply(1, userIds.B),
        reply(1, userIds.A),
        reply(1, userIds.B, true),
        reply(2, userIds.B),
        reply(2, userIds.C),
        reply(3, userIds.C),
        reply(3, userIds.A),
        reply(4, userIds.C),
        reply(4, userIds.A),
      ]);
    });

    function getCounts(token = tokens.A) {
      return request(app.getHttpServer()).get(route).set('Authorization', `Bearer ${token}`);
    }

    it.each([
      { account: 'A' as const, expected: { sentRequests: 3, receivedRequests: 2, total: 5 } },
      { account: 'B' as const, expected: { sentRequests: 2, receivedRequests: 1, total: 3 } },
      { account: 'C' as const, expected: { sentRequests: 1, receivedRequests: 2, total: 3 } },
    ])(
      `${route} (GET) should isolate account $account and count only received unread replies across its request lists`,
      async ({ account, expected }) => {
        const response = await getCounts(tokens[account]).expect(200);

        expect(response.body).toEqual(expected);
      },
    );

    it(`${route} (GET) should return three zeros for an account without requests`, async () => {
      const token = await getAccessToken('counts-empty@example.com');

      const response = await getCounts(token).expect(200);

      expect(response.body).toEqual({ sentRequests: 0, receivedRequests: 0, total: 0 });
    });

    it(`${route} (GET) should not count initial request texts when there are no conversation replies`, async () => {
      await messagesRepository.clear();

      const response = await getCounts().expect(200);

      expect(response.body).toEqual({ sentRequests: 0, receivedRequests: 0, total: 0 });
      expect(await requestsRepository.count()).toBe(5);
    });

    it(`${route} (GET) should return zero when all conversation replies are already read`, async () => {
      await messagesRepository.update(
        messages.map((message) => message.id),
        { readAt: new Date() },
      );

      const response = await getCounts().expect(200);

      expect(response.body).toEqual({ sentRequests: 0, receivedRequests: 0, total: 0 });
    });

    it(`${route} (GET) should leave message read dates and request statuses unchanged on repeated consultation`, async () => {
      const messagesBefore = await messagesRepository.find({ order: { id: 'ASC' } });
      const requestsBefore = await requestsRepository.find({ order: { id: 'ASC' } });

      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await getCounts().expect(200);
        expect(response.body).toEqual({ sentRequests: 3, receivedRequests: 2, total: 5 });
      }

      expect(await messagesRepository.find({ order: { id: 'ASC' } })).toEqual(messagesBefore);
      expect(await requestsRepository.find({ order: { id: 'ASC' } })).toEqual(requestsBefore);
    });

    it(`${route} (GET) should reflect bounded read updates and later replies without affecting the other participant's count`, async () => {
      await request(app.getHttpServer())
        .get(`/service-requests/${requests[0].id}/messages`)
        .set('Authorization', `Bearer ${tokens.A}`)
        .expect(200);
      expect((await getCounts().expect(200)).body).toEqual({
        sentRequests: 3,
        receivedRequests: 2,
        total: 5,
      });
      const markRead = (upToMessageId: number) =>
        request(app.getHttpServer())
          .patch(`/service-requests/${requests[0].id}/messages/read`)
          .set('Authorization', `Bearer ${tokens.A}`)
          .send({ upToMessageId });

      await markRead(messages[0].id).expect(204);
      expect((await getCounts().expect(200)).body).toEqual({
        sentRequests: 2,
        receivedRequests: 2,
        total: 4,
      });
      await markRead(messages[3].id).expect(204);
      expect((await getCounts().expect(200)).body).toEqual({
        sentRequests: 1,
        receivedRequests: 2,
        total: 3,
      });
      expect((await getCounts(tokens.B).expect(200)).body).toEqual({
        sentRequests: 2,
        receivedRequests: 1,
        total: 3,
      });
      await request(app.getHttpServer())
        .post(`/service-requests/${requests[0].id}/messages`)
        .set('Authorization', `Bearer ${tokens.B}`)
        .send({ content: 'Nouvelle réponse après lecture.' })
        .expect(201);
      await markRead(messages[3].id).expect(204);
      expect((await getCounts().expect(200)).body).toEqual({
        sentRequests: 2,
        receivedRequests: 2,
        total: 4,
      });
    });

    it.each(['offering', 'provider'] as const)(
      `${route} (GET) should preserve historical unread counts after %s deletion`,
      async (target) => {
        await request(app.getHttpServer())
          .delete(
            target === 'offering'
              ? `/service-providers/1/service-offerings/${offeringId}`
              : '/service-providers/1',
          )
          .set('Authorization', `Bearer ${tokens.B}`)
          .expect(204);

        const response = await getCounts().expect(200);

        expect(response.body).toEqual({ sentRequests: 3, receivedRequests: 2, total: 5 });
        expect(await messagesRepository.count()).toBe(13);
        expect(await requestsRepository.findOneByOrFail({ id: requests[0].id })).toMatchObject({
          serviceOfferingId: null,
          serviceProviderId: target === 'provider' ? null : 1,
        });
      },
    );

    it(`${route} (GET) should ignore forged account and read-status query filters`, async () => {
      const response = await getCounts()
        .query({
          userId: userIds.B,
          requesterUserId: userIds.B,
          recipientUserId: userIds.B,
          authorUserId: userIds.A,
          readAt: 'not-null',
        })
        .expect(200);

      expect(response.body).toEqual({ sentRequests: 3, receivedRequests: 2, total: 5 });
    });

    it.each(['missing', 'invalid', 'expired'] as const)(
      `${route} (GET) should reject a %s token with 401`,
      async (kind) => {
        const pending = request(app.getHttpServer()).get(route);
        if (kind !== 'missing') {
          const token =
            kind === 'invalid'
              ? 'invalid-token'
              : await app.get(JwtService).signAsync({ sub: String(userIds.A) }, { expiresIn: -1 });
          pending.set('Authorization', `Bearer ${token}`);
        }

        await pending.expect(401);
        expect(await messagesRepository.count()).toBe(13);
      },
    );

    it(`${route} (GET) should document the authenticated 200 response and non-negative count fields in Swagger`, () => {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().addBearerAuth().build(),
      );
      const operation = document.paths[route].get!;

      expect(operation.responses['200']).toMatchObject({
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ServiceRequestUnreadMessageCountsDto' },
          },
        },
      });
      expect(operation.responses).toHaveProperty('401');
      expect(operation.security).toEqual(expect.arrayContaining([{ bearer: [] }]));
      expect(document.components!.schemas!.ServiceRequestUnreadMessageCountsDto).toMatchObject({
        required: ['sentRequests', 'receivedRequests', 'total'],
        properties: {
          sentRequests: { type: 'number', minimum: 0 },
          receivedRequests: { type: 'number', minimum: 0 },
          total: { type: 'number', minimum: 0 },
        },
      });
    });
  });

  describe('service request consultation', () => {
    let tokenA: string;
    let tokenB: string;
    let userA: number;
    let userB: number;
    let repository: Repository<ServiceRequest>;
    let rows: ServiceRequest[];
    let participants: Record<number, { id: number; firstName: string; lastName: string }>;

    beforeEach(async () => {
      tokenA = await getAccessToken('a@example.com');
      tokenB = await getAccessToken('b@example.com');
      await getAccessToken('c@example.com');
      const users = app.get(UsersService);
      userA = (await users.findByEmail('a@example.com'))!.id;
      userB = (await users.findByEmail('b@example.com'))!.id;
      const userC = (await users.findByEmail('c@example.com'))!.id;
      participants = {
        [userA]: { id: userA, firstName: 'Alice', lastName: 'Martin' },
        [userB]: { id: userB, firstName: 'Bruno', lastName: 'Leroy' },
        [userC]: { id: userC, firstName: 'Chloé', lastName: 'Durand' },
      };
      const userRepository = app.get<Repository<User>>(getRepositoryToken(User));
      for (const participant of Object.values(participants)) {
        await userRepository.update(participant.id, {
          firstName: participant.firstName,
          lastName: participant.lastName,
        });
      }
      repository = app.get<Repository<ServiceRequest>>(getRepositoryToken(ServiceRequest));
      const old = new Date('2026-01-01T10:00:00Z');
      const recent = new Date('2026-01-02T10:00:00Z');
      rows = await repository.save(
        [
          { from: userA, to: userB, at: old },
          { from: userA, to: userC, at: recent },
          { from: userA, to: userB, at: recent },
          { from: userB, to: userA, at: old },
          { from: userC, to: userA, at: recent },
          { from: userB, to: userA, at: recent },
          { from: userB, to: userC, at: new Date('2026-01-03T10:00:00Z') },
        ].map(({ from, to, at }, index) =>
          repository.create({
            message: `Message privé ${index}`,
            requesterUserId: from,
            recipientUserId: to,
            serviceOfferingId: null,
            offeringTitleSnapshot: 'Conseil historique',
            offeringPricingTypeSnapshot: ServicePricingType.FREE,
            offeringHourlyRateSnapshot: null,
            createdAt: at,
          }),
        ),
      );
    });

    function asJson(selected: ServiceRequest[]) {
      return selected.map((row) => ({
        ...row,
        hasReview: false,
        createdAt: row.createdAt.toISOString(),
        requester: participants[row.requesterUserId],
        recipient: participants[row.recipientUserId],
      }));
    }

    it.each(['sent', 'received'] as const)(
      '/service-requests/%s (GET) should isolate accounts and sort by date then id descending',
      async (direction) => {
        const expectedA =
          direction === 'sent' ? [rows[2], rows[1], rows[0]] : [rows[5], rows[4], rows[3]];
        const expectedB = direction === 'sent' ? [rows[6], rows[5], rows[3]] : [rows[2], rows[0]];

        const responseA = await request(app.getHttpServer())
          .get(`/service-requests/${direction}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        const responseB = await request(app.getHttpServer())
          .get(`/service-requests/${direction}`)
          .set('Authorization', `Bearer ${tokenB}`)
          .expect(200);

        expect(responseA.body).toEqual(asJson(expectedA));
        expect(responseB.body).toEqual(asJson(expectedB));
        expect(await repository.count()).toBe(7);
      },
    );

    it.each(['sent', 'received'] as const)(
      '/service-requests/%s (GET) should expose only the id and names of each participant',
      async (direction) => {
        const response = await request(app.getHttpServer())
          .get(`/service-requests/${direction}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);

        expect(response.body).toHaveLength(3);
        for (const item of response.body) {
          expect(item.requester).toEqual(participants[item.requesterUserId]);
          expect(item.recipient).toEqual(participants[item.recipientUserId]);
          expect(Object.keys(item.requester).sort()).toEqual(['firstName', 'id', 'lastName']);
          expect(Object.keys(item.recipient).sort()).toEqual(['firstName', 'id', 'lastName']);
          expect(item).toHaveProperty('serviceProviderId', null);
          expect(item).not.toHaveProperty('requesterUser');
          expect(item).not.toHaveProperty('recipientUser');
          expect(item).not.toHaveProperty('email');
          expect(item).not.toHaveProperty('passwordHash');
        }
      },
    );

    it.each(['sent', 'received'] as const)(
      '/service-requests/%s (GET) should return an empty list for an account without requests',
      async (direction) => {
        const emptyToken = await getAccessToken('empty@example.com');

        const response = await request(app.getHttpServer())
          .get(`/service-requests/${direction}`)
          .set('Authorization', `Bearer ${emptyToken}`)
          .expect(200);

        expect(response.body).toEqual([]);
      },
    );

    it.each(['sent', 'received'] as const)(
      '/service-requests/%s (GET) should ignore client-supplied account filters',
      async (direction) => {
        const expected =
          direction === 'sent' ? [rows[2], rows[1], rows[0]] : [rows[5], rows[4], rows[3]];

        const response = await request(app.getHttpServer())
          .get(`/service-requests/${direction}`)
          .query({ userId: userB, requesterUserId: userB, recipientUserId: userB })
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);

        expect(response.body).toEqual(asJson(expected));
      },
    );

    it.each([
      { direction: 'sent', kind: 'missing' },
      { direction: 'sent', kind: 'invalid' },
      { direction: 'sent', kind: 'expired' },
      { direction: 'received', kind: 'missing' },
      { direction: 'received', kind: 'invalid' },
      { direction: 'received', kind: 'expired' },
    ])(
      '/service-requests/$direction (GET) should reject a $kind bearer token',
      async ({ direction, kind }) => {
        const pending = request(app.getHttpServer()).get(`/service-requests/${direction}`);
        if (kind === 'invalid') pending.set('Authorization', 'Bearer invalid-token');
        if (kind === 'expired') {
          const expired = await app
            .get(JwtService)
            .signAsync({ sub: String(userA) }, { expiresIn: -1 });
          pending.set('Authorization', `Bearer ${expired}`);
        }

        const response = await pending.expect(401);

        expect(response.body.statusCode).toBe(401);
        expect(response.body).not.toHaveProperty('data');
        expect(await repository.count()).toBe(7);
      },
    );
  });

  describe('service request status updates', () => {
    const route = '/service-requests/:id/status';
    let recipientToken: string;
    let requesterToken: string;
    let unrelatedToken: string;
    let recipientId: number;
    let providerId: number;
    let original: ServiceRequest;
    let originalResponse: Record<string, unknown>;
    let repository: Repository<ServiceRequest>;

    beforeEach(async () => {
      recipientToken = await getAccessToken('recipient@example.com');
      requesterToken = await getAccessToken('requester@example.com');
      unrelatedToken = await getAccessToken('unrelated@example.com');
      const usersService = app.get(UsersService);
      recipientId = (await usersService.findByEmail('recipient@example.com'))!.id;
      const requesterId = (await usersService.findByEmail('requester@example.com'))!.id;
      await app.get<Repository<User>>(getRepositoryToken(User)).update(requesterId, {
        firstName: 'Bruno',
        lastName: 'Leroy',
      });
      const provider = await request(app.getHttpServer())
        .post('/service-providers')
        .set('Authorization', `Bearer ${recipientToken}`)
        .send({
          firstName: 'Alice',
          lastName: 'Martin',
          profession: 'Peintre',
          city: 'Paris',
          description: 'Peinture intérieure.',
          hourlyRate: 35,
          available: true,
          imageUrl: '',
        })
        .expect(201);
      providerId = provider.body.id;
      const offering = await request(app.getHttpServer())
        .post(`/service-providers/${providerId}/service-offerings`)
        .set('Authorization', `Bearer ${recipientToken}`)
        .send({
          title: 'Peinture',
          description: 'Peinture intérieure.',
          pricingType: ServicePricingType.HOURLY,
          hourlyRate: 35,
        })
        .expect(201);
      const created = await request(app.getHttpServer())
        .post(
          `/service-providers/${providerId}/service-offerings/${offering.body.id}/service-requests`,
        )
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ message: 'Bonjour, je souhaite repeindre ma chambre.' })
        .expect(201);
      originalResponse = created.body;
      repository = app.get<Repository<ServiceRequest>>(getRepositoryToken(ServiceRequest));
      original = await repository.findOneByOrFail({ id: created.body.id });
    });

    function patch(body: object, token = recipientToken, id: number | string = original.id) {
      return request(app.getHttpServer())
        .patch(`/service-requests/${id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    }

    async function expectStored(
      status = ServiceRequestStatus.SENT,
      serviceOfferingId = original.serviceOfferingId,
      serviceProviderId = original.serviceProviderId,
    ) {
      expect(await repository.findOneByOrFail({ id: original.id })).toEqual({
        ...original,
        status,
        serviceOfferingId,
        serviceProviderId,
      });
      expect(await repository.count()).toBe(1);
    }

    const validTransitions = [
      { from: ServiceRequestStatus.SENT, to: ServiceRequestStatus.READ },
      { from: ServiceRequestStatus.SENT, to: ServiceRequestStatus.ACCEPTED },
      { from: ServiceRequestStatus.SENT, to: ServiceRequestStatus.REJECTED },
      { from: ServiceRequestStatus.READ, to: ServiceRequestStatus.ACCEPTED },
      { from: ServiceRequestStatus.READ, to: ServiceRequestStatus.REJECTED },
      { from: ServiceRequestStatus.ACCEPTED, to: ServiceRequestStatus.COMPLETED },
    ];

    it.each(validTransitions)(
      `${route} (PATCH) should allow the recipient to change $from to $to without changing other data`,
      async ({ from, to }) => {
        await repository.update(original.id, { status: from });

        const response = await patch({ status: to }).expect(200);

        expect(response.body).toEqual({ ...originalResponse, status: to });
        expect(response.body.requester).toEqual({
          id: original.requesterUserId,
          firstName: 'Bruno',
          lastName: 'Leroy',
        });
        expect(response.body.recipient).toEqual({
          id: recipientId,
          firstName: 'Alice',
          lastName: 'Martin',
        });
        await expectStored(to);
      },
    );

    it.each(
      Object.values(ServiceRequestStatus).flatMap((from) =>
        [
          ServiceRequestStatus.READ,
          ServiceRequestStatus.ACCEPTED,
          ServiceRequestStatus.REJECTED,
          ServiceRequestStatus.COMPLETED,
        ]
          .filter(
            (to) =>
              !validTransitions.some(
                (transition) => transition.from === from && transition.to === to,
              ),
          )
          .map((to) => ({ from, to })),
      ),
    )(
      `${route} (PATCH) should reject the transition $from to $to with 409`,
      async ({ from, to }) => {
        await repository.update(original.id, { status: from });

        await patch({ status: to }).expect(409);

        await expectStored(from);
      },
    );

    it.each(['requester', 'unrelated'] as const)(
      `${route} (PATCH) should reject the %s account with 403`,
      async (actor) => {
        const token = actor === 'requester' ? requesterToken : unrelatedToken;

        await patch({ status: ServiceRequestStatus.ACCEPTED }, token).expect(403);

        await expectStored();
      },
    );

    it.each(['requester', 'unrelated'] as const)(
      `${route} (PATCH) should prevent the %s from completing an accepted request`,
      async (actor) => {
        await repository.update(original.id, { status: ServiceRequestStatus.ACCEPTED });
        const token = actor === 'requester' ? requesterToken : unrelatedToken;

        await patch({ status: ServiceRequestStatus.COMPLETED }, token).expect(403);

        await expectStored(ServiceRequestStatus.ACCEPTED);
      },
    );

    it.each(['missing', 'invalid', 'expired'] as const)(
      `${route} (PATCH) should reject a %s bearer token with 401`,
      async (kind) => {
        const pending = request(app.getHttpServer())
          .patch(`/service-requests/${original.id}/status`)
          .send({ status: ServiceRequestStatus.ACCEPTED });
        if (kind === 'invalid') pending.set('Authorization', 'Bearer invalid-token');
        if (kind === 'expired') {
          const expired = await app
            .get(JwtService)
            .signAsync({ sub: String(recipientId) }, { expiresIn: -1 });
          pending.set('Authorization', `Bearer ${expired}`);
        }

        await pending.expect(401);

        await expectStored();
      },
    );

    it.each([
      { label: 'a missing status', body: {} },
      { label: 'a null status', body: { status: null } },
      { label: 'a numeric status', body: { status: 1 } },
      { label: 'an unknown status', body: { status: 'CANCELLED' } },
      { label: 'a lowercase status', body: { status: 'accepted' } },
      { label: 'the initial SENT status', body: { status: ServiceRequestStatus.SENT } },
      { label: 'an array status', body: { status: [ServiceRequestStatus.ACCEPTED] } },
    ])(`${route} (PATCH) should reject $label with 400`, async ({ body }) => {
      await patch(body).expect(400);

      await expectStored();
    });

    it.each([
      { field: 'message', value: 'Message remplacé' },
      { field: 'recipientUserId', value: 999 },
      { field: 'requesterUserId', value: 999 },
      { field: 'serviceOfferingId', value: null },
      { field: 'serviceProviderId', value: 999 },
      { field: 'offeringTitleSnapshot', value: 'Titre remplacé' },
      { field: 'offeringPricingTypeSnapshot', value: ServicePricingType.FREE },
      { field: 'offeringHourlyRateSnapshot', value: 1 },
    ])(
      `${route} (PATCH) should reject an extra $field field with 400`,
      async ({ field, value }) => {
        await patch({ status: ServiceRequestStatus.ACCEPTED, [field]: value }).expect(400);

        await expectStored();
      },
    );

    it.each([
      { id: 'invalid', expected: 400 },
      { id: '1.5', expected: 400 },
      { id: '999999', expected: 404 },
    ])(`${route} (PATCH) should return $expected for request id $id`, async ({ id, expected }) => {
      await patch({ status: ServiceRequestStatus.READ }, recipientToken, id).expect(expected);

      await expectStored();
    });

    it.each(['offering', 'provider'] as const)(
      `${route} (PATCH) should allow the recorded recipient to accept and complete after %s deletion`,
      async (deleted) => {
        const url =
          deleted === 'offering'
            ? `/service-providers/${providerId}/service-offerings/${original.serviceOfferingId}`
            : `/service-providers/${providerId}`;
        await request(app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${recipientToken}`)
          .expect(204);

        const response = await patch({ status: ServiceRequestStatus.ACCEPTED }).expect(200);

        expect(response.body).toEqual({
          ...originalResponse,
          serviceOfferingId: null,
          serviceProviderId: deleted === 'provider' ? null : providerId,
          status: ServiceRequestStatus.ACCEPTED,
        });
        await expectStored(
          ServiceRequestStatus.ACCEPTED,
          null,
          deleted === 'provider' ? null : providerId,
        );
        const completed = await patch({ status: ServiceRequestStatus.COMPLETED }).expect(200);
        expect(completed.body).toEqual({
          ...originalResponse,
          serviceOfferingId: null,
          serviceProviderId: deleted === 'provider' ? null : providerId,
          status: ServiceRequestStatus.COMPLETED,
        });
        await expectStored(
          ServiceRequestStatus.COMPLETED,
          null,
          deleted === 'provider' ? null : providerId,
        );
      },
    );

    it.each(['sent', 'received'] as const)(
      '/service-requests/%s (GET) should preserve SENT on consultation and reflect the full completion workflow',
      async (direction) => {
        const token = direction === 'sent' ? requesterToken : recipientToken;
        const before = await request(app.getHttpServer())
          .get(`/service-requests/${direction}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(before.body).toEqual([originalResponse]);
        await expectStored();

        await patch({ status: ServiceRequestStatus.READ }).expect(200);
        const after = await request(app.getHttpServer())
          .get(`/service-requests/${direction}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(after.body).toEqual([{ ...originalResponse, status: ServiceRequestStatus.READ }]);
        await expectStored(ServiceRequestStatus.READ);

        await patch({ status: ServiceRequestStatus.ACCEPTED }).expect(200);
        await patch({ status: ServiceRequestStatus.COMPLETED }).expect(200);
        const completed = await request(app.getHttpServer())
          .get(`/service-requests/${direction}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(completed.body).toEqual([
          { ...originalResponse, status: ServiceRequestStatus.COMPLETED },
        ]);
        await expectStored(ServiceRequestStatus.COMPLETED);
      },
    );

    it.each([
      {
        label: 'accept or reject decisions',
        from: ServiceRequestStatus.SENT,
        decisions: [ServiceRequestStatus.ACCEPTED, ServiceRequestStatus.REJECTED],
      },
      {
        label: 'completion attempts',
        from: ServiceRequestStatus.ACCEPTED,
        decisions: [ServiceRequestStatus.COMPLETED, ServiceRequestStatus.COMPLETED],
      },
    ])(
      `${route} (PATCH) should let only one of two concurrent $label succeed`,
      async ({ from, decisions }) => {
        await repository.update(original.id, { status: from });
        const realFindOne = repository.findOne.bind(repository);
        let readCount = 0;
        let releaseReads!: () => void;
        const bothRead = new Promise<void>((resolve) => {
          releaseReads = resolve;
        });
        // Keep real database reads and writes: both attempts must read the same initial status.
        const spy = vi.spyOn(repository, 'findOne').mockImplementation(async (options) => {
          const row = await realFindOne(options);
          readCount += 1;
          if (readCount === 2) releaseReads();
          await bothRead;
          return row;
        });
        try {
          const responses = await Promise.all(decisions.map((status) => patch({ status })));

          expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
          const winnerIndex = responses.findIndex((response) => response.status === 200);
          expect(responses[winnerIndex].body).toEqual({
            ...originalResponse,
            status: decisions[winnerIndex],
          });
          expect(responses[1 - winnerIndex].body.message).toBe(
            'Service request changed. Refresh and try again',
          );
          // Restore before reading the final row, so this assertion does not use the barrier.
          spy.mockRestore();
          await expectStored(decisions[winnerIndex]);
        } finally {
          releaseReads();
          spy.mockRestore();
        }
      },
    );
  });

  afterEach(async () => {
    await app.close();
  });
});
