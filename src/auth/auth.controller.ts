import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUserDto } from './dto/current-user.dto.js';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a user' })
  @ApiCreatedResponse({ description: 'User registered successfully' })
  @ApiBadRequestResponse({ description: 'Invalid registration data' })
  @ApiConflictResponse({ description: 'Email already registered' })
  register(@Body() registerDto: RegisterDto): Promise<void> {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in and return an access token' })
  @ApiOkResponse({ description: 'Access token issued' })
  @ApiBadRequestResponse({ description: 'Invalid login data' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accessToken: string }> {
    const result = await this.authService.login(loginDto);

    response.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: this.configService.getOrThrow<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/auth',
      expires: result.expiresAt,
    });

    return { accessToken: result.accessToken };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiOkResponse({
    description: 'Authenticated user profile',
    type: CurrentUserDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, or expired access token, or user no longer exists',
  })
  me(@Req() request: Request & { user: { id: number } }): Promise<CurrentUserDto> {
    return this.authService.getCurrentUser(request.user.id);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renew the access token using the refresh cookie' })
  @ApiOkResponse({ description: 'Access token renewed' })
  @ApiForbiddenResponse({ description: 'Untrusted request origin' })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, expired or revoked refresh session',
  })
  refresh(@Req() request: Request): Promise<{ accessToken: string }> {
    const origin = request.get('origin');

    if (origin !== 'http://localhost:4200' && origin !== 'http://localhost:3000') {
      throw new ForbiddenException('Untrusted request origin');
    }

    const refreshToken: unknown = request.cookies?.refresh_token;

    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    return this.authService.refresh(refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Sign out of the current refresh session' })
  @ApiNoContentResponse({ description: 'Signed out successfully' })
  @ApiForbiddenResponse({ description: 'Untrusted request origin' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const origin = request.get('origin');

    if (origin !== 'http://localhost:4200' && origin !== 'http://localhost:3000') {
      throw new ForbiddenException('Untrusted request origin');
    }

    const refreshToken: unknown = request.cookies?.refresh_token;

    if (typeof refreshToken === 'string' && refreshToken.length > 0) {
      await this.authService.logout(refreshToken);
    }

    response.clearCookie('refresh_token', {
      httpOnly: true,
      secure: this.configService.getOrThrow<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/auth',
    });
  }
}
