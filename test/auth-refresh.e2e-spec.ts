import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { User } from '../src/users/user.entity.js';
import { RefreshSession } from '../src/auth/refresh-session.entity.js';

describe('Refresh-token renewal (e2e)', () => {
  const credentials = {
    email: 'alice.refresh@example.test',
    password: 'test-only-refresh-password',
  };
  let app: INestApplication;
  let sessions: Repository<RefreshSession>;
  let users: Repository<User>;
  let user: User;
  let cookie: string;
  let secret: string;
  let accessToken: string;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash(credentials.password);
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    users = app.get<Repository<User>>(getRepositoryToken(User));
    sessions = app.get<Repository<RefreshSession>>(getRepositoryToken(RefreshSession));
    user = await users.save({
      firstName: 'Alice',
      lastName: 'Martin',
      email: credentials.email,
      passwordHash,
    });
    // Keep the login session id different from the owner's user id.
    await sessions.save({
      userId: user.id,
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(1);
    cookie = cookies[0].split(';')[0];
    secret = decodeURIComponent(cookie.slice('refresh_token='.length));
    accessToken = login.body.accessToken;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await app?.close();
  });

  function renew(origin = 'http://localhost:4200') {
    return request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', cookie);
  }

  function snapshot(): Promise<unknown> {
    return sessions.query('SELECT * FROM refresh_sessions ORDER BY id');
  }

  function cookieHash() {
    return createHash('sha256').update(secret).digest('hex');
  }

  it.each(['http://localhost:4200', 'http://localhost:3000'])(
    '/auth/refresh (POST) renews a usable access token for the cookie owner from %s',
    async (origin) => {
      const stored = await sessions.findOneByOrFail({ tokenHash: cookieHash() });
      expect(stored.id).not.toBe(user.id);
      const before = await snapshot();
      const response = await renew(origin).expect(200);
      expect(response.body).toEqual({ accessToken: expect.any(String) });
      expect(response.headers['set-cookie']).toBeUndefined();
      const payload = await app
        .get(JwtService)
        .verifyAsync<{ sub: string; iat: number; exp: number }>(response.body.accessToken);
      expect(payload.sub).toBe(String(user.id));
      expect(payload.exp - payload.iat).toBe(15 * 60);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${response.body.accessToken}`)
        .expect(200)
        .expect(({ body }) =>
          expect(body).toEqual({
            id: user.id,
            firstName: 'Alice',
            lastName: 'Martin',
            email: credentials.email,
          }),
        );
      expect(await snapshot()).toEqual(before);
    },
  );

  it('/auth/refresh (POST) renews after the previous access token has expired', async () => {
    const before = await snapshot();
    const payload = app.get(JwtService).decode<{ exp: number }>(accessToken);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date((payload.exp + 1) * 1000));
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
    const response = await renew().set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(response.body.accessToken).not.toBe(accessToken);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${response.body.accessToken}`)
      .expect(200);
    expect(await snapshot()).toEqual(before);
  });

  it('/auth/refresh (POST) supports concurrent renewal without rotating or extending the session', async () => {
    const before = await snapshot();
    const responses = await Promise.all([renew().expect(200), renew().expect(200)]);
    for (const response of responses) {
      expect(response.body).toEqual({ accessToken: expect.any(String) });
      expect(response.headers['set-cookie']).toBeUndefined();
      const payload = await app
        .get(JwtService)
        .verifyAsync<{ sub: string }>(response.body.accessToken);
      expect(payload.sub).toBe(String(user.id));
    }
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    { label: 'missing', origin: undefined },
    { label: 'null', origin: 'null' },
    { label: 'external host', origin: 'https://evil.example' },
    { label: 'lookalike host', origin: 'http://localhost:4200.evil.example' },
    { label: 'different port', origin: 'http://localhost:4201' },
    { label: 'different scheme', origin: 'https://localhost:4200' },
    { label: 'appended path', origin: 'http://localhost:4200/' },
  ])(
    '/auth/refresh (POST) rejects an untrusted origin with a valid cookie: $label',
    async ({ origin }) => {
      const before = await snapshot();
      const call = request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie);
      if (origin !== undefined) call.set('Origin', origin);
      const response = await call.expect(403);
      expect(response.body.message).toBe('Untrusted request origin');
      expect(response.body.accessToken).toBeUndefined();
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await snapshot()).toEqual(before);
    },
  );

  it.each(['missing', 'empty', 'unknown', 'JSON object', 'JSON array'])(
    '/auth/refresh (POST) rejects an invalid cookie even with a valid access token and body: %s',
    async (kind) => {
      const before = await snapshot();
      const call = request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Origin', 'http://localhost:4200')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken: secret, userId: 999 });
      if (kind !== 'missing') {
        const value =
          kind === 'empty'
            ? ''
            : kind === 'unknown'
              ? 'unknown-test-secret'
              : encodeURIComponent(
                  `j:${JSON.stringify(kind === 'JSON object' ? { secret } : [secret])}`,
                );
        call.set('Cookie', `refresh_token=${value}`);
      }
      const response = await call.expect(401);
      expect(response.body.message).toBe('Invalid refresh session');
      expect(response.body.accessToken).toBeUndefined();
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await snapshot()).toEqual(before);
    },
  );

  it.each(['expired', 'revoked'])(
    '/auth/refresh (POST) rejects an unusable session: %s',
    async (kind) => {
      await sessions.update(
        { tokenHash: cookieHash() },
        kind === 'expired' ? { expiresAt: new Date(Date.now() - 1) } : { revokedAt: new Date() },
      );
      const before = await snapshot();
      const response = await renew().expect(401);
      expect(response.body.message).toBe('Invalid refresh session');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await snapshot()).toEqual(before);
    },
  );

  it('/auth/refresh (POST) rejects the cookie after its user has been deleted', async () => {
    await users.delete({ id: user.id });
    await renew().expect(401);
    expect(await sessions.count()).toBe(0);
  });

  it('/auth/refresh (POST) returns a generic server error without a token when session lookup fails', async () => {
    const before = await snapshot();
    vi.spyOn(sessions, 'findOneBy').mockRejectedValueOnce(new Error('Session lookup unavailable'));
    const response = await renew().expect(500);
    expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await snapshot()).toEqual(before);
  });
});
