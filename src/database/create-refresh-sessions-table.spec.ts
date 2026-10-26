import { DataSource, type Repository } from 'typeorm';
import { InitialSchema1789026143459 } from './migrations/1789026143459-InitialSchema.js';
import { AddCityIndex1789287684113 } from './migrations/1789287684113-AddCityIndex.js';
import { CreateReviewsTable1789293137887 } from './migrations/1789293137887-CreateReviewsTable.js';
import { CreateServiceOfferingsTable1790070822998 } from './migrations/1790070822998-CreateServiceOfferingsTable.js';
import { CreateUsersTable1790601439138 } from './migrations/1790601439138-CreateUsersTable.js';
import { AddServiceProviderOwner1791272307897 } from './migrations/1791272307897-AddServiceProviderOwner.js';
import { CreateServiceRequestsTable1791550235362 } from './migrations/1791550235362-CreateServiceRequestsTable.js';
import { AddServiceRequestProvider1792423748325 } from './migrations/1792423748325-AddServiceRequestProvider.js';

import { LinkReviewsToServiceRequests1792425147989 } from './migrations/1792425147989-LinkReviewsToServiceRequests.js';

import { CreateServiceRequestMessagesTable1792655516545 } from './migrations/1792655516545-CreateServiceRequestMessagesTable.js';
import { ServiceProvider } from '../service-providers/service-provider.entity.js';
import { ServiceOffering } from '../service-offerings/service-offering.entity.js';
import { Review } from '../reviews/review.entity.js';
import { User } from '../users/user.entity.js';
import { ServiceRequest } from '../service-requests/service-request.entity.js';
import { ServiceRequestMessage } from '../service-requests/service-request-message.entity.js';

import { CreateServiceRequestMessageRemindersTable1792945282224 } from './migrations/1792945282224-CreateServiceRequestMessageRemindersTable.js';
import { ServiceRequestMessageReminder } from '../service-requests/service-request-message-reminder.entity.js';
import { RefreshSession } from '../auth/refresh-session.entity.js';
import { CreateRefreshSessionsTable1793030800379 } from './migrations/1793030800379-CreateRefreshSessionsTable.js';

describe('CreateRefreshSessionsTable migration', () => {
  let source: DataSource;
  let sessions: Repository<RefreshSession>;
  let appliedNames: string[];
  let before: Record<string, Record<string, unknown>[]>;
  let beforeSchema: Record<string, unknown>[];
  const migrationName = 'CreateRefreshSessionsTable1793030800379';
  const expiresAt = new Date('2026-11-02T10:05:00.000Z');
  const tables = [
    'users',
    'service_providers',
    'reviews',
    'service_offerings',
    'service_requests',
    'service_request_messages',
    'service_request_message_reminders',
  ];

  async function snapshot() {
    return Object.fromEntries(
      await Promise.all(
        tables.map(async (table) => [
          table,
          await source.query(`SELECT * FROM "${table}" ORDER BY id`),
        ]),
      ),
    ) as Record<string, Record<string, unknown>[]>;
  }

  async function schemaSnapshot(): Promise<Record<string, unknown>[]> {
    return source.query(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE type IN ('table', 'index') AND tbl_name IN (${tables.map(() => '?').join(', ')})
       ORDER BY type, name`,
      tables,
    );
  }

  beforeEach(async () => {
    source = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: false,
      entities: [
        ServiceProvider,
        ServiceOffering,
        Review,
        User,
        ServiceRequest,
        ServiceRequestMessage,
        ServiceRequestMessageReminder,
        RefreshSession,
      ],
      migrations: [
        InitialSchema1789026143459,
        AddCityIndex1789287684113,
        CreateReviewsTable1789293137887,
        CreateServiceOfferingsTable1790070822998,
        CreateUsersTable1790601439138,
        AddServiceProviderOwner1791272307897,
        CreateServiceRequestsTable1791550235362,
        AddServiceRequestProvider1792423748325,
        LinkReviewsToServiceRequests1792425147989,
        CreateServiceRequestMessagesTable1792655516545,
        CreateServiceRequestMessageRemindersTable1792945282224,
      ],
    });
    await source.initialize();
    await source.runMigrations();
    await source.query(`INSERT INTO users (id, firstName, lastName, email, passwordHash) VALUES
      (1, 'Alice', 'Martin', 'alice@example.test', 'test-only-hash'),
      (2, 'Bruno', 'Leroy', 'bruno@example.test', 'test-only-hash'),
      (3, 'Chloe', 'Test', 'chloe@example.test', 'test-only-hash'),
      (4, 'Isolated', 'Recipient', 'isolated@example.test', 'test-only-hash')`);
    await source.query(`INSERT INTO service_providers
      (id, firstName, lastName, profession, city, description, hourlyRate, available, imageUrl, ownerUserId)
      VALUES (13, 'Alice', 'Martin', 'Conseil', 'Paris', 'Conseil', 35, 1, '', 1),
             (14, 'Bruno', 'Leroy', 'Conseil', 'Lyon', 'Conseil', 30, 1, '', 2)`);
    await source.query(`INSERT INTO service_offerings
      (id, title, description, pricingType, hourlyRate, serviceProviderId)
      VALUES (21, 'Peinture', 'Peinture interieure', 'HOURLY', 35, 13),
             (22, 'Conseil', 'Conseil gratuit', 'FREE', NULL, 14)`);
    await source.query(`INSERT INTO service_requests
      (id, message, status, offeringTitleSnapshot, offeringPricingTypeSnapshot,
       offeringHourlyRateSnapshot, requesterUserId, recipientUserId, serviceOfferingId, serviceProviderId)
      VALUES (41, 'Peindre une chambre', 'COMPLETED', 'Peinture', 'HOURLY', 35, 3, 1, 21, 13),
             (42, 'Un conseil', 'SENT', 'Conseil', 'FREE', NULL, 3, 2, 22, 14),
             (43, 'Ancienne offre', 'ACCEPTED', 'Conseil', 'FREE', NULL, 1, 2, NULL, 14)`);
    await source.query(`INSERT INTO reviews (id, authorName, rating, comment, serviceProviderId)
      VALUES (31, 'Auteur historique', 5, 'Tres bien', 13)`);
    await source.query(`INSERT INTO service_request_messages
      (id, content, createdAt, readAt, serviceRequestId, authorUserId)
      VALUES (51, 'Bonjour Alice', '2026-10-25 10:00:00.000', NULL, 41, 3),
             (52, 'Bonjour Chloe', '2026-10-25 10:01:00.000', '2026-10-25 10:02:00.000', 42, 2)`);
    await source.query(`INSERT INTO service_request_message_reminders
      (id, status, dueAt, serviceRequestId, recipientUserId)
      VALUES (61, 'PENDING', '2026-11-02 10:00:00.000', 41, 1)`);
    before = await snapshot();
    beforeSchema = await schemaSnapshot();
    sessions = source.getRepository(RefreshSession);
    source.migrations.push(new CreateRefreshSessionsTable1793030800379());
    appliedNames = (await source.runMigrations()).map((migration) => migration.name);
  });

  afterEach(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  function addSession(values: Partial<RefreshSession> = {}) {
    return sessions.save({
      tokenHash: 'a'.repeat(64),
      userId: 1,
      expiresAt,
      revokedAt: null,
      ...values,
    });
  }

  it('should apply only the new migration while preserving all earlier rows, tables, indexes and foreign keys', async () => {
    expect(appliedNames).toEqual([migrationName]);
    expect(await snapshot()).toEqual(before);
    expect(await schemaSnapshot()).toEqual(beforeSchema);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
    expect(await sessions.count()).toBe(0);
  });

  it('should create the required columns, named indexes and user cascade foreign key', async () => {
    const columns = await source.query('PRAGMA table_info(refresh_sessions)');
    expect(columns.map((column: { name: string }) => column.name)).toEqual([
      'id',
      'tokenHash',
      'expiresAt',
      'revokedAt',
      'createdAt',
      'userId',
    ]);
    expect(columns).toContainEqual(
      expect.objectContaining({ name: 'tokenHash', type: 'varchar(64)', notnull: 1 }),
    );
    expect(columns).toContainEqual(expect.objectContaining({ name: 'revokedAt', notnull: 0 }));
    expect(columns).toContainEqual(
      expect.objectContaining({ name: 'createdAt', dflt_value: "datetime('now')" }),
    );
    expect(await source.query('PRAGMA foreign_key_list(refresh_sessions)')).toEqual([
      expect.objectContaining({ table: 'users', from: 'userId', to: 'id', on_delete: 'CASCADE' }),
    ]);
    expect(await source.query('PRAGMA index_list(refresh_sessions)')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'IDX_refresh_sessions_token_hash', unique: 1 }),
        expect.objectContaining({ name: 'IDX_refresh_sessions_user_id', unique: 0 }),
      ]),
    );
    for (const [index, column] of [
      ['IDX_refresh_sessions_token_hash', 'tokenHash'],
      ['IDX_refresh_sessions_user_id', 'userId'],
    ]) {
      expect(
        (await source.query(`PRAGMA index_info("${index}")`)).map(
          (row: { name: string }) => row.name,
        ),
      ).toEqual([column]);
    }
  });

  it('should persist session dates and user relations while excluding hashes from ordinary entity reads', async () => {
    const startedAt = Math.floor(Date.now() / 1000) * 1000;
    const saved = await addSession();
    const loaded = await sessions.findOneOrFail({
      where: { id: saved.id },
      relations: { user: true },
    });
    expect(loaded).toMatchObject({
      id: saved.id,
      userId: 1,
      expiresAt,
      revokedAt: null,
      user: { id: 1, firstName: 'Alice' },
    });
    expect(loaded.createdAt).toBeInstanceOf(Date);
    expect(loaded.createdAt.getTime()).toBeGreaterThanOrEqual(startedAt);
    expect(loaded.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(loaded.tokenHash).toBeUndefined();
    expect(loaded.user.passwordHash).toBeUndefined();
    const byHash = await sessions.findOneByOrFail({ tokenHash: 'a'.repeat(64) });
    expect(byHash.id).toBe(saved.id);
    expect(byHash.tokenHash).toBeUndefined();
    const explicit = await sessions
      .createQueryBuilder('session')
      .addSelect('session.tokenHash')
      .where('session.id = :id', { id: saved.id })
      .getOneOrFail();
    expect(explicit.tokenHash).toBe('a'.repeat(64));
  });

  it('should allow distinct sessions for one account and independent sessions for another account', async () => {
    const first = await addSession();
    const second = await addSession({ tokenHash: 'b'.repeat(64) });
    const third = await addSession({ tokenHash: 'c'.repeat(64), userId: 2 });
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
    expect(await sessions.countBy({ userId: 1 })).toBe(2);
    expect(await sessions.countBy({ userId: 2 })).toBe(1);
    expect(await snapshot()).toEqual(before);
  });

  it.each([null, new Date('2026-10-26T10:00:00.000Z')])(
    'should reject a duplicate token hash across accounts even when revokedAt is %s',
    async (revokedAt) => {
      const original = await addSession({ revokedAt });
      await expect(addSession({ userId: 2 })).rejects.toThrow(/UNIQUE constraint failed/);
      expect(await sessions.count()).toBe(1);
      expect(await sessions.findOneByOrFail({ id: original.id })).toMatchObject({
        userId: 1,
        revokedAt,
      });
    },
  );

  it('should reject a session for a nonexistent user without changing existing data', async () => {
    await expect(addSession({ userId: 999_999 })).rejects.toThrow(/FOREIGN KEY constraint failed/);
    expect(await sessions.count()).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it.each(['tokenHash', 'expiresAt', 'userId'] as const)(
    'should reject a missing required %s',
    async (column) => {
      await expect(addSession({ [column]: undefined })).rejects.toThrow(
        /NOT NULL constraint failed/,
      );
      expect(await sessions.count()).toBe(0);
      expect(await snapshot()).toEqual(before);
    },
  );

  it('should cascade deletion of an isolated user to only that user sessions', async () => {
    const retained = await addSession();
    await addSession({ tokenHash: 'b'.repeat(64), userId: 4 });
    await addSession({ tokenHash: 'c'.repeat(64), userId: 4 });
    await source.getRepository(User).delete(4);
    expect(await sessions.count()).toBe(1);
    expect((await sessions.findOneByOrFail({ id: retained.id })).userId).toBe(1);
    expect(await source.getRepository(User).count()).toBe(3);
    const after = await snapshot();
    expect(after).toEqual({ ...before, users: before.users.filter((user) => user.id !== 4) });
  });

  it('should delete a session without deleting its owner or altering unrelated application data', async () => {
    const first = await addSession();
    const retained = await addSession({ tokenHash: 'b'.repeat(64) });
    await sessions.delete(first.id);
    expect(await sessions.count()).toBe(1);
    expect((await sessions.findOneByOrFail({ id: retained.id })).userId).toBe(1);
    expect(await snapshot()).toEqual(before);
  });

  it('should revert and reapply only the session table while preserving earlier data and schemas', async () => {
    await addSession();
    await source.undoLastMigration();
    expect(
      await source.query(
        "SELECT name FROM sqlite_master WHERE name IN ('refresh_sessions', 'IDX_refresh_sessions_token_hash', 'IDX_refresh_sessions_user_id')",
      ),
    ).toEqual([]);
    expect(await snapshot()).toEqual(before);
    expect(await schemaSnapshot()).toEqual(beforeSchema);
    expect((await source.runMigrations()).map((migration) => migration.name)).toEqual([
      migrationName,
    ]);
    expect(await sessions.count()).toBe(0);
    expect(await snapshot()).toEqual(before);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
