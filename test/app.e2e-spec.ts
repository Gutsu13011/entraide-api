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

  it('/service-providers/1/reviews (POST)', async () => {
    const createReviewDto = {
      authorName: 'Alice Martin',
      rating: 5,
      comment: 'Excellent service',
    };
    const accessToken = await getAccessToken();

    return request(app.getHttpServer())
      .post('/service-providers/1/reviews')
      .send(createReviewDto)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: 1,
          ...createReviewDto,
          serviceProviderId: 1,
          createdAt: expect.any(String),
        });
      });
  });

  it('/service-providers/1/reviews (GET)', async () => {
    const createReviewDto = {
      authorName: 'Alice Martin',
      rating: 5,
      comment: 'Excellent service',
    };
    const accessToken = await getAccessToken();

    await request(app.getHttpServer())
      .post('/service-providers/1/reviews')
      .send(createReviewDto)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    return request(app.getHttpServer())
      .get('/service-providers/1/reviews')
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
        expect(response.body[0]).toMatchObject({
          id: 1,
          ...createReviewDto,
          serviceProviderId: 1,
          createdAt: expect.any(String),
        });
      });
  });

  it('/service-providers/1/reviews (POST) should return 400 for an invalid rating', async () => {
    const accessToken = await getAccessToken();

    return request(app.getHttpServer())
      .post('/service-providers/1/reviews')
      .send({
        authorName: 'Alice Martin',
        rating: 6,
        comment: 'Excellent service',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          error: 'Bad Request',
          statusCode: 400,
        });
        expect(response.body.message).toContain('rating must not be greater than 5');
      });
  });

  it('/service-providers/999/reviews (POST) should return 404', async () => {
    const accessToken = await getAccessToken();

    return request(app.getHttpServer())
      .post('/service-providers/999/reviews')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        authorName: 'Alice Martin',
        rating: 5,
        comment: 'Excellent service',
      })
      .expect(404)
      .expect({
        message: 'Service provider with id 999 not found',
        error: 'Not Found',
        statusCode: 404,
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

  it('/service-providers/1/reviews/summary (GET) should return an empty summary', () => {
    return request(app.getHttpServer())
      .get('/service-providers/1/reviews/summary')
      .expect(200)
      .expect({
        reviewCount: 0,
        averageRating: null,
      });
  });

  it('/service-providers/1/reviews/summary (GET) should return a rounded average', async () => {
    const accessToken = await getAccessToken();

    for (const rating of [5, 4, 2]) {
      await request(app.getHttpServer())
        .post('/service-providers/1/reviews')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          authorName: 'Test Author',
          rating,
          comment: 'Test review',
        })
        .expect(201);
    }

    return request(app.getHttpServer())
      .get('/service-providers/1/reviews/summary')
      .expect(200)
      .expect({
        reviewCount: 3,
        averageRating: 3.7,
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
    const review = { authorName: 'Test Author', rating: 5, comment: 'Test review' };

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
          createdAt: expect.any(String),
          requesterUserId: requesterId,
          recipientUserId: ownerId,
          serviceOfferingId: offering.id,
          offeringTitleSnapshot: offering.title,
          offeringPricingTypeSnapshot: pricing.pricingType,
          offeringHourlyRateSnapshot: pricing.hourlyRate,
          requester: { id: requesterId, firstName: 'Bruno', lastName: 'Leroy' },
          recipient: { id: ownerId, firstName: 'Alice', lastName: 'Martin' },
        });
        expect(Number.isNaN(Date.parse(response.body.createdAt))).toBe(false);
        const stored = await requestsRepository.findOneByOrFail({ id: response.body.id });
        const expectedStored = { ...response.body, createdAt: new Date(response.body.createdAt) };
        delete expectedStored.requester;
        delete expectedStored.recipient;
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
        });
        expect(await app.get(UsersService).findById(ownerId)).not.toBeNull();
      },
    );
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

  afterEach(async () => {
    await app.close();
  });
});
