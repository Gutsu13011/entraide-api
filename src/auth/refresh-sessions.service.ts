import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RefreshSession } from './refresh-session.entity.js';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';

@Injectable()
export class RefreshSessionsService {
  constructor(
    @InjectRepository(RefreshSession)
    private readonly refreshSessionRepository: Repository<RefreshSession>,
    private readonly configService: ConfigService,
  ) {}

  async create(userId: number): Promise<{ refreshToken: string; expiresAt: Date }> {
    const refreshToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const ttlDays = this.configService.getOrThrow<number>('REFRESH_SESSION_TTL_DAYS');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    const session = this.refreshSessionRepository.create({
      userId,
      tokenHash,
      expiresAt,
      revokedAt: null,
    });

    await this.refreshSessionRepository.save(session);

    return { refreshToken, expiresAt };
  }

  async findValid(refreshToken: string): Promise<RefreshSession> {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.refreshSessionRepository.findOneBy({
      tokenHash,
      revokedAt: IsNull(),
      expiresAt: MoreThan(new Date()),
    });

    if (session === null) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    return session;
  }
}
