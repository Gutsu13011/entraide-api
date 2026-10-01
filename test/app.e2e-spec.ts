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

  it('/service-providers (POST)', () => {
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

    return request(app.getHttpServer())
      .post('/service-providers')
      .send(createServiceProviderDto)
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: 3,
          ...createServiceProviderDto,
        });
      });
  });

  it('/service-providers (POST) should return 400 for an invalid body', () => {
    return request(app.getHttpServer())
      .post('/service-providers')
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

  it('/service-providers/1 (PATCH)', () => {
    const updateServiceProviderDto = {
      city: 'Nice',
      available: false,
    };

    return request(app.getHttpServer())
      .patch('/service-providers/1')
      .send(updateServiceProviderDto)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: 1,
          firstName: 'Sophie',
          city: 'Nice',
          available: false,
        });
      });
  });

  it('/service-providers/1 (DELETE)', async () => {
    const deleteResponse = await request(app.getHttpServer())
      .delete('/service-providers/1')
      .expect(204);

    expect(deleteResponse.text).toBe('');

    await request(app.getHttpServer()).get('/service-providers/1').expect(404);
  });

  it('/service-providers (POST) should return 400 property id should not exist', () => {
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

    return request(app.getHttpServer())
      .post('/service-providers')
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

  it('/service-providers/1/reviews (POST)', () => {
    const createReviewDto = {
      authorName: 'Alice Martin',
      rating: 5,
      comment: 'Excellent service',
    };

    return request(app.getHttpServer())
      .post('/service-providers/1/reviews')
      .send(createReviewDto)
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

    await request(app.getHttpServer())
      .post('/service-providers/1/reviews')
      .send(createReviewDto)
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

  it('/service-providers/1/reviews (POST) should return 400 for an invalid rating', () => {
    return request(app.getHttpServer())
      .post('/service-providers/1/reviews')
      .send({
        authorName: 'Alice Martin',
        rating: 6,
        comment: 'Excellent service',
      })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          error: 'Bad Request',
          statusCode: 400,
        });
        expect(response.body.message).toContain('rating must not be greater than 5');
      });
  });

  it('/service-providers/999/reviews (POST) should return 404', () => {
    return request(app.getHttpServer())
      .post('/service-providers/999/reviews')
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
    for (const rating of [5, 4, 2]) {
      await request(app.getHttpServer())
        .post('/service-providers/1/reviews')
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

  it('/service-providers/1/service-offerings (POST)', () => {
    const createServiceOfferingMock = {
      title: 'title',
      description: 'description',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 20,
    };

    return request(app.getHttpServer())
      .post('/service-providers/1/service-offerings')
      .send(createServiceOfferingMock)
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: 1,
          ...createServiceOfferingMock,
          serviceProviderId: 1,
        });
      });
  });

  it('/service-providers/1/service-offerings (GET)', async () => {
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

    await request(app.getHttpServer())
      .post('/service-providers/1/service-offerings')
      .send(createServiceOffering1)
      .expect(201);
    await request(app.getHttpServer())
      .post('/service-providers/1/service-offerings')
      .send(createServiceOffering2)
      .expect(201);

    return request(app.getHttpServer())
      .get('/service-providers/1/service-offerings')
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(2);
        expect(response.body[0]).toMatchObject({
          id: 1,
          ...createServiceOffering1,
          serviceProviderId: 1,
        });
        expect(response.body[1]).toMatchObject({
          id: 2,
          ...createServiceOffering2,
          hourlyRate: null,
          serviceProviderId: 1,
        });
      });
  });

  it('/service-providers/1/service-offerings (POST) should return 400 no hourlyRate', () => {
    const createServiceOfferingMock = {
      title: 'title',
      description: 'description',
      pricingType: ServicePricingType.HOURLY,
    };

    return request(app.getHttpServer())
      .post('/service-providers/1/service-offerings')
      .send(createServiceOfferingMock)
      .expect(400)
      .expect((response) => {
        expect(response.body.message).toContain('hourlyRate should not be null or undefined');
      });
  });

  it('/service-providers/1/service-offerings (POST) should return 400', () => {
    const createServiceOfferingMock = {
      title: 'title',
      description: 'description',
      pricingType: ServicePricingType.FREE,
      hourlyRate: 20,
    };

    return request(app.getHttpServer())
      .post('/service-providers/1/service-offerings')
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

  it('/auth/me (GET) should reject GET /auth/me without a bearer token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('/auth/me (GET) should return the public profile from GET /auth/me with a valid token', async () => {
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

  afterEach(async () => {
    await app.close();
  });
});
