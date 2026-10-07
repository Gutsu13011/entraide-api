import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceProvider } from './../src/service-providers/service-provider.entity.js';
import { ServicePricingType } from '../src/service-offerings/service-pricing-type.enum.js';
import { User } from '../src/users/user.entity.js';
import { UsersService } from '../src/users/users.service.js';
import argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';

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

  afterEach(async () => {
    await app.close();
  });
});
