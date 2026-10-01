import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js';
import argon2 from 'argon2';
import { LoginDto } from './dto/login.dto.js';
import { JwtService } from '@nestjs/jwt';
import { CurrentUserDto } from './dto/current-user.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<void> {
    const isUserExisted = await this.usersService.findByEmail(registerDto.email);

    if (isUserExisted !== null) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await argon2.hash(registerDto.password);

    await this.usersService.create(
      registerDto.firstName,
      registerDto.lastName,
      registerDto.email,
      passwordHash,
    );
  }

  async validateCredentials(loginDto: LoginDto): Promise<{ id: number; email: string }> {
    const user = await this.usersService.findByEmailWithPassword(loginDto.email);

    if (user === null) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, loginDto.password);

    if (isPasswordValid === false) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { id: user.id, email: user.email };
  }

  async login(loginDto: LoginDto): Promise<{ accessToken: string }> {
    const userValidated = await this.validateCredentials(loginDto);
    const accessToken = await this.jwtService.signAsync({ sub: String(userValidated.id) });

    return { accessToken };
  }

  async getCurrentUser(id: number): Promise<CurrentUserDto> {
    const user = await this.usersService.findById(id);

    if (user === null) {
      throw new UnauthorizedException('Invalid user');
    }

    return { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email };
  }
}
