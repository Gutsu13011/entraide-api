import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { type Repository } from 'typeorm';
import { RefreshSessionsService } from './refresh-sessions.service.js';
import { RefreshSession } from './refresh-session.entity.js';
import { User } from '../users/user.entity.js';
import { CreateUsersTable1790601439138 } from '../database/migrations/1790601439138-CreateUsersTable.js';
import { CreateRefreshSessionsTable1793030800379 } from '../database/migrations/1793030800379-CreateRefreshSessionsTable.js';

describe('RefreshSessionsService', () => {
  const now = new Date('2026-10-26T12:34:56.789Z');
  const hash = (token: string) => createHash('sha256').update(token).digest('hex');
  let module: TestingModule;
  let service: RefreshSessionsService;
  let sessions: Repository<RefreshSession>;
  let config: ConfigService;
  let user: User;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    config = new ConfigService({ REFRESH_SESSION_TTL_DAYS: 7 });
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [User, RefreshSession],
          synchronize: false,
          migrations: [CreateUsersTable1790601439138, CreateRefreshSessionsTable1793030800379],
          migrationsRun: true,
        }),
        TypeOrmModule.forFeature([User, RefreshSession]),
      ],
      providers: [RefreshSessionsService, { provide: ConfigService, useValue: config }],
    }).compile();
    service = module.get(RefreshSessionsService);
    sessions = module.get<Repository<RefreshSession>>(getRepositoryToken(RefreshSession));
    user = await module.get<Repository<User>>(getRepositoryToken(User)).save({
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alice@example.test',
      passwordHash: 'test-only-password-hash',
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await module?.close();
  });

  it('should return a 32-byte URL-safe secret while storing only its SHA-256 hash for the user', async () => {
    const result = await service.create(user.id);
    expect(Object.keys(result).sort()).toEqual(['expiresAt', 'refreshToken']);
    expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(result.refreshToken, 'base64url')).toHaveLength(32);

    const stored = await sessions
      .createQueryBuilder('session')
      .addSelect('session.tokenHash')
      .getOneOrFail();
    expect(stored.tokenHash).toBe(hash(result.refreshToken));
    expect(stored.tokenHash).not.toBe(result.refreshToken);
    expect(stored.userId).toBe(user.id);
    expect(stored.revokedAt).toBeNull();
    expect(stored.expiresAt).toEqual(result.expiresAt);
    expect(stored.createdAt).toBeInstanceOf(Date);
    const rows: unknown = await sessions.query('SELECT * FROM refresh_sessions');
    expect(JSON.stringify(rows)).not.toContain(result.refreshToken);
  });

  it.each([1, 7, 30])(
    'should expire exactly %i configured days after creation',
    async (ttlDays) => {
      vi.spyOn(config, 'getOrThrow').mockReturnValue(ttlDays);
      const result = await service.create(user.id);
      expect(result.expiresAt.getTime()).toBe(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
      expect(
        (await sessions.findOneByOrFail({ tokenHash: hash(result.refreshToken) })).expiresAt,
      ).toEqual(result.expiresAt);
    },
  );

  it('should create independent sessions when the same user signs in concurrently', async () => {
    const results = await Promise.all([service.create(user.id), service.create(user.id)]);
    expect(results[0].refreshToken).not.toBe(results[1].refreshToken);
    expect(await sessions.countBy({ userId: user.id })).toBe(2);
    for (const result of results) {
      expect(await sessions.findOneBy({ tokenHash: hash(result.refreshToken) })).not.toBeNull();
    }
  });

  it('should keep the token hash hidden in ordinary reads while allowing lookup by its hash', async () => {
    const result = await service.create(user.id);
    const stored = await sessions.findOneOrFail({
      where: { tokenHash: hash(result.refreshToken) },
      relations: { user: true },
    });
    expect(stored.tokenHash).toBeUndefined();
    expect(stored.user.id).toBe(user.id);
    expect(stored.user.passwordHash).toBeUndefined();
  });

  it('should not return the secret before the session has been saved', async () => {
    const originalSave = sessions.save.bind(sessions);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(sessions, 'save').mockImplementationOnce(async (session) => {
      await gate;
      return originalSave(session);
    });
    const settled = vi.fn();
    const pending = service.create(user.id);
    void pending.then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(await sessions.count()).toBe(0);
    release();
    await expect(pending).resolves.toEqual({
      refreshToken: expect.any(String),
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
    expect(await sessions.count()).toBe(1);
  });

  it('should propagate a persistence failure without returning a usable secret', async () => {
    const error = new Error('Database unavailable');
    vi.spyOn(sessions, 'save').mockRejectedValueOnce(error);
    await expect(service.create(user.id)).rejects.toBe(error);
    expect(await sessions.count()).toBe(0);
  });

  it('should reject creation when the session lifetime configuration is missing', async () => {
    const error = new Error('Missing session lifetime');
    vi.spyOn(config, 'getOrThrow').mockImplementationOnce(() => {
      throw error;
    });
    await expect(service.create(user.id)).rejects.toBe(error);
    expect(await sessions.count()).toBe(0);
  });

  it('should reject a nonexistent user without persisting a session', async () => {
    await expect(service.create(user.id + 100)).rejects.toThrow(/FOREIGN KEY/);
    expect(await sessions.count()).toBe(0);
  });
  describe('findValid', () => {
    it('should return the session belonging to the secret without exposing its hash or changing its lifetime', async () => {
      const issued = await service.create(user.id);
      const before: unknown = await sessions.query('SELECT * FROM refresh_sessions ORDER BY id');

      const found = await service.findValid(issued.refreshToken);

      expect(found.userId).toBe(user.id);
      expect(found.revokedAt).toBeNull();
      expect(found.expiresAt).toEqual(issued.expiresAt);
      expect(found.tokenHash).toBeUndefined();
      expect(await sessions.findOneBy({ id: found.id })).toEqual(found);
      expect(await sessions.query('SELECT * FROM refresh_sessions ORDER BY id')).toEqual(before);
    });

    it.each([-1, 0])(
      'should reject an expired session whose expiry is %i milliseconds from now',
      async (offset) => {
        const issued = await service.create(user.id);
        await sessions.update({ userId: user.id }, { expiresAt: new Date(now.getTime() + offset) });
        const before: unknown = await sessions.query('SELECT * FROM refresh_sessions ORDER BY id');

        await expect(service.findValid(issued.refreshToken)).rejects.toMatchObject({
          status: 401,
          message: 'Invalid refresh session',
        });
        expect(await sessions.query('SELECT * FROM refresh_sessions ORDER BY id')).toEqual(before);
      },
    );

    it('should accept a session that expires one millisecond in the future', async () => {
      const issued = await service.create(user.id);
      const expiresAt = new Date(now.getTime() + 1);
      await sessions.update({ userId: user.id }, { expiresAt });

      await expect(service.findValid(issued.refreshToken)).resolves.toMatchObject({
        userId: user.id,
        expiresAt,
        revokedAt: null,
      });
    });

    it('should recheck revocation and reject a previously valid session even before its expiry', async () => {
      const issued = await service.create(user.id);
      const found = await service.findValid(issued.refreshToken);
      await sessions.update({ id: found.id }, { revokedAt: now });

      await expect(service.findValid(issued.refreshToken)).rejects.toMatchObject({
        status: 401,
        message: 'Invalid refresh session',
      });
      expect((await sessions.findOneByOrFail({ id: found.id })).expiresAt).toEqual(
        issued.expiresAt,
      );
    });

    it.each(['unknown secret', 'empty secret', 'stored hash'])(
      'should reject an invalid secret without falling back to another active session: %s',
      async (kind) => {
        const issued = await service.create(user.id);
        const invalid =
          kind === 'empty secret'
            ? ''
            : kind === 'stored hash'
              ? hash(issued.refreshToken)
              : 'unknown-test-only-secret';
        const before: unknown = await sessions.query('SELECT * FROM refresh_sessions ORDER BY id');

        await expect(service.findValid(invalid)).rejects.toMatchObject({
          status: 401,
          message: 'Invalid refresh session',
        });
        expect(await sessions.query('SELECT * FROM refresh_sessions ORDER BY id')).toEqual(before);
      },
    );

    it('should reject the secret after its user and sessions have been deleted', async () => {
      const issued = await service.create(user.id);
      await module.get<Repository<User>>(getRepositoryToken(User)).delete({ id: user.id });

      await expect(service.findValid(issued.refreshToken)).rejects.toMatchObject({
        status: 401,
        message: 'Invalid refresh session',
      });
      expect(await sessions.count()).toBe(0);
    });

    it('should propagate a database read failure rather than reporting invalid credentials', async () => {
      const issued = await service.create(user.id);
      const error = new Error('Session database unavailable');
      vi.spyOn(sessions, 'findOneBy').mockRejectedValueOnce(error);

      await expect(service.findValid(issued.refreshToken)).rejects.toBe(error);
    });
  });
  describe('revoke', () => {
    it('should revoke only the matching session and leave other sessions and users unchanged', async () => {
      const targeted = await service.create(user.id);
      const sameUserSession = await service.create(user.id);
      const users = module.get<Repository<User>>(getRepositoryToken(User));
      const otherUser = await users.save({
        firstName: 'Bruno',
        lastName: 'Leroy',
        email: 'bruno@example.test',
        passwordHash: 'test-only-password-hash',
      });
      const otherUserSession = await service.create(otherUser.id);
      const selected = await sessions.findOneByOrFail({ tokenHash: hash(targeted.refreshToken) });
      const before = await sessions.find({ order: { id: 'ASC' } });

      await expect(service.revoke(targeted.refreshToken)).resolves.toBeUndefined();

      expect(await sessions.find({ order: { id: 'ASC' } })).toEqual(
        before.map((session) =>
          session.id === selected.id ? { ...session, revokedAt: now } : session,
        ),
      );
      await expect(service.findValid(targeted.refreshToken)).rejects.toMatchObject({ status: 401 });
      await expect(service.findValid(sameUserSession.refreshToken)).resolves.toMatchObject({
        userId: user.id,
      });
      await expect(service.findValid(otherUserSession.refreshToken)).resolves.toMatchObject({
        userId: otherUser.id,
      });
      expect(await users.count()).toBe(2);
    });

    it('should preserve the first revocation timestamp when revocation is repeated', async () => {
      const issued = await service.create(user.id);
      await service.revoke(issued.refreshToken);
      const before: unknown = await sessions.query('SELECT * FROM refresh_sessions ORDER BY id');
      vi.setSystemTime(new Date(now.getTime() + 60000));

      await expect(service.revoke(issued.refreshToken)).resolves.toBeUndefined();

      expect(await sessions.query('SELECT * FROM refresh_sessions ORDER BY id')).toEqual(before);
    });

    it.each(['unknown secret', 'empty secret', 'stored hash'])(
      'should make no changes when revoking an unmatched secret: %s',
      async (kind) => {
        const issued = await service.create(user.id);
        const invalid =
          kind === 'empty secret'
            ? ''
            : kind === 'stored hash'
              ? hash(issued.refreshToken)
              : 'unknown-test-only-secret';
        const before: unknown = await sessions.query('SELECT * FROM refresh_sessions ORDER BY id');

        await expect(service.revoke(invalid)).resolves.toBeUndefined();

        expect(await sessions.query('SELECT * FROM refresh_sessions ORDER BY id')).toEqual(before);
        await expect(service.findValid(issued.refreshToken)).resolves.toMatchObject({
          userId: user.id,
        });
      },
    );

    it('should also revoke an expired session without changing its expiry or deleting it', async () => {
      const issued = await service.create(user.id);
      const expiresAt = new Date(now.getTime() - 1);
      await sessions.update({ tokenHash: hash(issued.refreshToken) }, { expiresAt });

      await service.revoke(issued.refreshToken);

      expect(
        await sessions.findOneByOrFail({ tokenHash: hash(issued.refreshToken) }),
      ).toMatchObject({ userId: user.id, expiresAt, revokedAt: now });
      expect(await sessions.count()).toBe(1);
    });

    it('should propagate a database write failure and leave the session usable for an explicit retry', async () => {
      const issued = await service.create(user.id);
      const error = new Error('Session revocation unavailable');
      vi.spyOn(sessions, 'update').mockRejectedValueOnce(error);

      await expect(service.revoke(issued.refreshToken)).rejects.toBe(error);
      await expect(service.findValid(issued.refreshToken)).resolves.toMatchObject({
        revokedAt: null,
      });
      await expect(service.revoke(issued.refreshToken)).resolves.toBeUndefined();
      await expect(service.findValid(issued.refreshToken)).rejects.toMatchObject({ status: 401 });
    });

    it('should wait for the database update before completing revocation', async () => {
      const issued = await service.create(user.id);
      const update = sessions.update.bind(sessions);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.spyOn(sessions, 'update').mockImplementationOnce(async (criteria, values) => {
        await gate;
        return update(criteria, values);
      });
      const settled = vi.fn();
      const pending = service.revoke(issued.refreshToken);
      void pending.then(settled);
      await Promise.resolve();
      expect(settled).not.toHaveBeenCalled();
      expect(
        (await sessions.findOneByOrFail({ tokenHash: hash(issued.refreshToken) })).revokedAt,
      ).toBeNull();

      release();
      await expect(pending).resolves.toBeUndefined();
      expect(
        (await sessions.findOneByOrFail({ tokenHash: hash(issued.refreshToken) })).revokedAt,
      ).toEqual(now);
    });
  });
});
