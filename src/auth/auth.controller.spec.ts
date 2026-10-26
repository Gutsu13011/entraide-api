import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('AuthController', () => {
  let controller: AuthController;
  const authServiceMock = { register: vi.fn(), login: vi.fn(), refresh: vi.fn(), logout: vi.fn() };
  const config = { getOrThrow: vi.fn() };
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  const response = { cookie, clearCookie } as unknown as Response;
  const loginDto = { email: 'alice@example.test', password: 'test-only-password' };
  const loginResult = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: new Date('2026-11-02T12:00:00.000Z'),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    config.getOrThrow.mockReturnValue('development');
    authServiceMock.login.mockResolvedValue(loginResult);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: ConfigService, useValue: config },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it.each(['development', 'test', 'production'])(
      'should set the refresh cookie and return only the access token in %s',
      async (environment) => {
        config.getOrThrow.mockReturnValue(environment);
        const result = await controller.login(loginDto, response);
        expect(authServiceMock.login).toHaveBeenCalledExactlyOnceWith(loginDto);
        expect(cookie).toHaveBeenCalledExactlyOnceWith('refresh_token', loginResult.refreshToken, {
          httpOnly: true,
          secure: environment === 'production',
          sameSite: 'lax',
          path: '/auth',
          expires: loginResult.expiresAt,
        });
        expect(result).toEqual({ accessToken: loginResult.accessToken });
      },
    );

    it.each([
      new UnauthorizedException('Invalid credentials'),
      new Error('Session persistence failed'),
    ])('should propagate a login failure without setting a cookie: %s', async (error) => {
      authServiceMock.login.mockRejectedValueOnce(error);
      await expect(controller.login(loginDto, response)).rejects.toBe(error);
      expect(cookie).not.toHaveBeenCalled();
    });

    it('should wait for login success before setting the refresh cookie', async () => {
      let finish!: (result: typeof loginResult) => void;
      authServiceMock.login.mockReturnValueOnce(
        new Promise<typeof loginResult>((resolve) => {
          finish = resolve;
        }),
      );
      const pending = controller.login(loginDto, response);
      expect(cookie).not.toHaveBeenCalled();
      finish(loginResult);
      await expect(pending).resolves.toEqual({ accessToken: loginResult.accessToken });
      expect(cookie).toHaveBeenCalledOnce();
    });
  });
  describe('refresh', () => {
    const secret = 'test-only-refresh-secret';
    function incoming(origin: string | undefined, cookies?: Record<string, unknown>): Request {
      return { get: vi.fn().mockReturnValue(origin), cookies } as unknown as Request;
    }

    it.each(['http://localhost:4200', 'http://localhost:3000'])(
      'should renew the access token from the cookie for trusted origin %s',
      async (origin) => {
        authServiceMock.refresh.mockResolvedValue({ accessToken: 'renewed-access-token' });
        const request = incoming(origin, { refresh_token: secret });
        await expect(controller.refresh(request)).resolves.toEqual({
          accessToken: 'renewed-access-token',
        });
        expect(request.get).toHaveBeenCalledExactlyOnceWith('origin');
        expect(authServiceMock.refresh).toHaveBeenCalledExactlyOnceWith(secret);
        expect(cookie).not.toHaveBeenCalled();
      },
    );

    it.each([
      undefined,
      'null',
      'https://evil.example',
      'http://localhost:4200.evil.example',
      'http://localhost:4201',
      'https://localhost:4200',
      'http://localhost:4200/',
    ])('should reject an untrusted origin before validating the cookie: %s', (origin) => {
      expect(() => controller.refresh(incoming(origin, { refresh_token: secret }))).toThrow(
        ForbiddenException,
      );
      expect(authServiceMock.refresh).not.toHaveBeenCalled();
    });

    it.each([
      undefined,
      {},
      { refresh_token: '' },
      { refresh_token: null },
      { refresh_token: 123 },
      { refresh_token: { value: secret } },
      { refresh_token: [secret] },
    ])('should reject missing or non-string refresh cookies: %j', (cookies) => {
      expect(() => controller.refresh(incoming('http://localhost:4200', cookies))).toThrow(
        UnauthorizedException,
      );
      expect(authServiceMock.refresh).not.toHaveBeenCalled();
    });

    it.each([
      new UnauthorizedException('Invalid refresh session'),
      new Error('Session database unavailable'),
    ])('should propagate a renewal failure without setting a cookie: %s', async (error) => {
      authServiceMock.refresh.mockRejectedValueOnce(error);
      await expect(
        controller.refresh(incoming('http://localhost:4200', { refresh_token: secret })),
      ).rejects.toBe(error);
      expect(cookie).not.toHaveBeenCalled();
    });
  });
  describe('logout', () => {
    const secret = 'test-only-refresh-secret';
    function incoming(origin: string | undefined, cookies?: Record<string, unknown>): Request {
      return { get: vi.fn().mockReturnValue(origin), cookies } as unknown as Request;
    }

    it.each([
      { environment: 'development', origin: 'http://localhost:4200' },
      { environment: 'test', origin: 'http://localhost:3000' },
      { environment: 'production', origin: 'http://localhost:4200' },
    ])(
      'should revoke the session and clear the matching cookie in $environment',
      async ({ environment, origin }) => {
        config.getOrThrow.mockReturnValue(environment);
        authServiceMock.logout.mockResolvedValue(undefined);

        await expect(
          controller.logout(incoming(origin, { refresh_token: secret }), response),
        ).resolves.toBeUndefined();

        expect(authServiceMock.logout).toHaveBeenCalledExactlyOnceWith(secret);
        expect(clearCookie).toHaveBeenCalledExactlyOnceWith('refresh_token', {
          httpOnly: true,
          secure: environment === 'production',
          sameSite: 'lax',
          path: '/auth',
        });
        expect(cookie).not.toHaveBeenCalled();
      },
    );

    it.each([
      undefined,
      'null',
      'https://evil.example',
      'http://localhost.evil.example:4200',
      'http://localhost:4201',
      'https://localhost:4200',
      'http://localhost:4200/',
    ])(
      'should reject an untrusted origin without revoking or clearing the cookie: %s',
      async (origin) => {
        await expect(
          controller.logout(incoming(origin, { refresh_token: secret }), response),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(authServiceMock.logout).not.toHaveBeenCalled();
        expect(clearCookie).not.toHaveBeenCalled();
      },
    );

    it.each([
      undefined,
      {},
      { refresh_token: '' },
      { refresh_token: null },
      { refresh_token: 123 },
      { refresh_token: { value: secret } },
      { refresh_token: [secret] },
    ])(
      'should clear an absent or malformed cookie without trying to revoke a session: %j',
      async (cookies) => {
        await expect(
          controller.logout(incoming('http://localhost:4200', cookies), response),
        ).resolves.toBeUndefined();
        expect(authServiceMock.logout).not.toHaveBeenCalled();
        expect(clearCookie).toHaveBeenCalledOnce();
      },
    );

    it('should propagate a revocation failure without clearing the cookie', async () => {
      const error = new Error('Session revocation unavailable');
      authServiceMock.logout.mockRejectedValueOnce(error);

      await expect(
        controller.logout(incoming('http://localhost:4200', { refresh_token: secret }), response),
      ).rejects.toBe(error);
      expect(clearCookie).not.toHaveBeenCalled();
    });

    it('should wait for revocation to finish before clearing the cookie', async () => {
      let finish!: () => void;
      authServiceMock.logout.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
      const pending = controller.logout(
        incoming('http://localhost:4200', { refresh_token: secret }),
        response,
      );
      expect(authServiceMock.logout).toHaveBeenCalledOnce();
      expect(clearCookie).not.toHaveBeenCalled();

      finish();
      await expect(pending).resolves.toBeUndefined();
      expect(clearCookie).toHaveBeenCalledOnce();
    });
  });
});
