import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  const jwtServiceMock = {
    verifyAsync: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtAuthGuard, { provide: JwtService, useValue: jwtServiceMock }],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should reject a request without an authorization header', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtServiceMock.verifyAsync).not.toHaveBeenCalled();
  });

  it.each(['Basic abc', 'Bearer', 'Bearer ', 'Bearer abc extra'])(
    'should reject a malformed authorization header: %s',
    async (authorization) => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization } }),
        }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwtServiceMock.verifyAsync).not.toHaveBeenCalled();
    },
  );

  it('should accept a valid bearer token', async () => {
    const request = {
      headers: { authorization: 'Bearer test-token' },
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    jwtServiceMock.verifyAsync.mockResolvedValue({ sub: '7' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtServiceMock.verifyAsync).toHaveBeenCalledWith('test-token');
    expect(request).toMatchObject({ user: { id: 7 } });
  });

  it('should reject an invalid bearer token', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: 'Bearer test-token' } }),
      }),
    } as unknown as ExecutionContext;

    jwtServiceMock.verifyAsync.mockRejectedValue(new Error('invalid token'));

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtServiceMock.verifyAsync).toHaveBeenCalledWith('test-token');
  });

  it('should reject a verified token without a user id', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: 'Bearer test-token' } }),
      }),
    } as unknown as ExecutionContext;

    jwtServiceMock.verifyAsync.mockResolvedValue({});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
