import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js';
import argon2 from 'argon2';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { LoginDto } from './dto/login.dto.js';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../users/user.entity.js';
import { RefreshSessionsService } from './refresh-sessions.service.js';

describe('AuthService', () => {
  const usersServiceMock = {
    findByEmail: vi.fn(),
    create: vi.fn(),
    findByEmailWithPassword: vi.fn(),
    findById: vi.fn(),
  };
  const jwtServiceMock = {
    signAsync: vi.fn(),
  };

  const refreshSessionsServiceMock = { create: vi.fn(), findValid: vi.fn() };
  const session = {
    refreshToken: 'test-only-refresh-token',
    expiresAt: new Date('2026-11-02T12:00:00.000Z'),
  };

  let service: AuthService;

  beforeEach(async () => {
    vi.resetAllMocks();
    usersServiceMock.findByEmail.mockResolvedValue(null);
    refreshSessionsServiceMock.create.mockResolvedValue(session);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersServiceMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: RefreshSessionsService, useValue: refreshSessionsServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alicemartin@example.com',
      password: 'password1234567890&§(!',
    };

    it('should register an user', async () => {
      usersServiceMock.create.mockResolvedValue(undefined);
      await service.register(registerDto);

      const passwordHash = usersServiceMock.create.mock.calls[0][3];
      expect(await argon2.verify(passwordHash, registerDto.password)).toBe(true);

      expect(usersServiceMock.create).toHaveBeenCalledWith(
        registerDto.firstName,
        registerDto.lastName,
        registerDto.email,
        expect.any(String),
      );
    });

    it('should reject registration when user creation fails', async () => {
      const databaseError = new Error('Database unavailable');

      usersServiceMock.create.mockRejectedValue(databaseError);

      await expect(service.register(registerDto)).rejects.toBe(databaseError);
    });

    it('should reject registration when email is already registered', async () => {
      usersServiceMock.findByEmail.mockResolvedValue({ email: registerDto.email });

      await expect(service.register(registerDto)).rejects.toBeInstanceOf(ConflictException);
      expect(usersServiceMock.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(usersServiceMock.create).not.toHaveBeenCalled();
    });
  });

  describe('validateCredentials', async () => {
    const loginDto: LoginDto = {
      email: 'test@mail.com',
      password: 'ezuifzhjfdsksè!ç!è!çç!è!789',
    };
    const passwordHashed = await argon2.hash(loginDto.password);

    it('should return the user identity when credentials are valid', async () => {
      usersServiceMock.findByEmailWithPassword.mockResolvedValue({
        id: 1,
        email: loginDto.email,
        passwordHash: passwordHashed,
      });

      const result = await service.validateCredentials(loginDto);

      expect(usersServiceMock.findByEmailWithPassword).toHaveBeenCalledWith(loginDto.email);
      expect(result).toEqual({ id: 1, email: loginDto.email });
    });

    it('should reject credentials when the user does not exist', async () => {
      usersServiceMock.findByEmailWithPassword.mockResolvedValue(null);

      await expect(service.validateCredentials(loginDto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usersServiceMock.findByEmailWithPassword).toHaveBeenCalledWith(loginDto.email);
    });

    it('should reject credentials when the password is wrong', async () => {
      usersServiceMock.findByEmailWithPassword.mockResolvedValue({
        id: 1,
        email: loginDto.email,
        passwordHash: passwordHashed,
      });

      await expect(
        service.validateCredentials({ ...loginDto, password: 'wrongPasswordWritten' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('should return the access token and internal refresh session for the verified user', async () => {
      const loginDto = {
        email: 'test@mail.com',
        password: 'un-mot-de-passe-pour-le-test',
      };

      usersServiceMock.findByEmailWithPassword.mockResolvedValue({
        id: 7,
        email: loginDto.email,
        passwordHash: await argon2.hash(loginDto.password),
      });
      jwtServiceMock.signAsync.mockResolvedValue('fake-token');

      const result = await service.login(loginDto);

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith({ sub: '7' });
      expect(refreshSessionsServiceMock.create).toHaveBeenCalledExactlyOnceWith(7);
      expect(result).toEqual({ accessToken: 'fake-token', ...session });
    });
  });

  describe('login failures and persistence', () => {
    const loginDto = { email: 'alice@example.test', password: 'test-only-password' };

    it.each(['unknown user', 'incorrect password'])(
      'should not issue either token when credentials fail: %s',
      async (reason) => {
        usersServiceMock.findByEmailWithPassword.mockResolvedValue(
          reason === 'unknown user'
            ? null
            : {
                id: 7,
                email: loginDto.email,
                passwordHash: await argon2.hash('different-password'),
              },
        );
        await expect(service.login(loginDto)).rejects.toBeInstanceOf(UnauthorizedException);
        expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
        expect(refreshSessionsServiceMock.create).not.toHaveBeenCalled();
      },
    );

    it('should not create a refresh session if signing the access token fails', async () => {
      vi.spyOn(service, 'validateCredentials').mockResolvedValue({ id: 7, email: loginDto.email });
      const error = new Error('JWT signing failed');
      jwtServiceMock.signAsync.mockRejectedValueOnce(error);
      await expect(service.login(loginDto)).rejects.toBe(error);
      expect(refreshSessionsServiceMock.create).not.toHaveBeenCalled();
    });

    it('should fail login if saving the refresh session fails', async () => {
      vi.spyOn(service, 'validateCredentials').mockResolvedValue({ id: 7, email: loginDto.email });
      jwtServiceMock.signAsync.mockResolvedValue('test-access-token');
      const error = new Error('Session persistence failed');
      refreshSessionsServiceMock.create.mockRejectedValueOnce(error);
      await expect(service.login(loginDto)).rejects.toBe(error);
    });

    it('should wait for refresh-session persistence before returning the login result', async () => {
      vi.spyOn(service, 'validateCredentials').mockResolvedValue({ id: 7, email: loginDto.email });
      jwtServiceMock.signAsync.mockResolvedValue('test-access-token');
      let save!: (value: typeof session) => void;
      refreshSessionsServiceMock.create.mockReturnValueOnce(
        new Promise<typeof session>((resolve) => {
          save = resolve;
        }),
      );
      const settled = vi.fn();
      const pending = service.login(loginDto);
      void pending.then(settled);
      await vi.waitFor(() => expect(refreshSessionsServiceMock.create).toHaveBeenCalledOnce());
      expect(settled).not.toHaveBeenCalled();
      save(session);
      await expect(pending).resolves.toEqual({ accessToken: 'test-access-token', ...session });
    });
  });

  describe('refresh', () => {
    const refreshToken = 'test-only-refresh-secret';
    const verifiedSession = {
      id: 41,
      userId: 7,
      expiresAt: new Date('2026-11-02T12:00:00.000Z'),
      revokedAt: null,
    };

    beforeEach(() => {
      refreshSessionsServiceMock.findValid.mockResolvedValue(verifiedSession);
      jwtServiceMock.signAsync.mockResolvedValue('renewed-access-token');
    });

    it('should sign an access token for the verified session owner', async () => {
      const result = await service.refresh(refreshToken);

      expect(refreshSessionsServiceMock.findValid).toHaveBeenCalledExactlyOnceWith(refreshToken);
      expect(jwtServiceMock.signAsync).toHaveBeenCalledExactlyOnceWith({ sub: '7' });
      expect(result).toEqual({ accessToken: 'renewed-access-token' });
      expect(refreshSessionsServiceMock.create).not.toHaveBeenCalled();
      expect(usersServiceMock.findByEmailWithPassword).not.toHaveBeenCalled();
    });

    it.each(['unknown', 'expired', 'revoked'])(
      'should not sign an access token when the refresh session is %s',
      async () => {
        const error = new UnauthorizedException('Invalid refresh session');
        refreshSessionsServiceMock.findValid.mockRejectedValueOnce(error);

        await expect(service.refresh(refreshToken)).rejects.toBe(error);
        expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
        expect(refreshSessionsServiceMock.create).not.toHaveBeenCalled();
      },
    );

    it('should propagate a session lookup failure without signing an access token', async () => {
      const error = new Error('Session database unavailable');
      refreshSessionsServiceMock.findValid.mockRejectedValueOnce(error);

      await expect(service.refresh(refreshToken)).rejects.toBe(error);
      expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
      expect(refreshSessionsServiceMock.create).not.toHaveBeenCalled();
    });

    it('should propagate a signing failure without creating a new refresh session', async () => {
      const error = new Error('JWT signing failed');
      jwtServiceMock.signAsync.mockRejectedValueOnce(error);

      await expect(service.refresh(refreshToken)).rejects.toBe(error);
      expect(refreshSessionsServiceMock.create).not.toHaveBeenCalled();
    });

    it('should wait for session validation before signing an access token', async () => {
      let validate!: (value: typeof verifiedSession) => void;
      refreshSessionsServiceMock.findValid.mockReturnValueOnce(
        new Promise<typeof verifiedSession>((resolve) => {
          validate = resolve;
        }),
      );
      const pending = service.refresh(refreshToken);
      expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();

      validate(verifiedSession);
      await expect(pending).resolves.toEqual({ accessToken: 'renewed-access-token' });
      expect(jwtServiceMock.signAsync).toHaveBeenCalledOnce();
    });
  });

  describe('getCurrentUser', () => {
    const userMock: User = {
      id: 7,
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alicemartin@example.com',
      passwordHash: 'it-s-a-password-hash',
      createdAt: new Date(),
    };

    it('should return only public profile fields for an existing user', async () => {
      usersServiceMock.findById.mockResolvedValue(userMock);

      const result = await service.getCurrentUser(userMock.id);

      expect(usersServiceMock.findById).toHaveBeenCalledWith(userMock.id);
      expect(result).toEqual({
        id: userMock.id,
        firstName: userMock.firstName,
        lastName: userMock.lastName,
        email: userMock.email,
      });
    });

    it('should reject a token when its user no longer exists', async () => {
      usersServiceMock.findById.mockResolvedValue(null);

      await expect(service.getCurrentUser(userMock.id)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
