import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js';
import argon2 from 'argon2';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { LoginDto } from './dto/login.dto.js';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../users/user.entity.js';

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

  let service: AuthService;

  beforeEach(async () => {
    vi.resetAllMocks();
    usersServiceMock.findByEmail.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersServiceMock },
        { provide: JwtService, useValue: jwtServiceMock },
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
    it('should return an access token for valid credentials', async () => {
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
      expect(result).toEqual({ accessToken: 'fake-token' });
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
