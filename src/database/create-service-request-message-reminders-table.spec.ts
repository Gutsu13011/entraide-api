import { DataSource, LessThanOrEqual, type Repository } from 'typeorm';
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
import { ServiceRequestMessageReminderStatus as ReminderStatus } from '../service-requests/service-request-message-reminder-status.enum.js';

describe('CreateServiceRequestMessageRemindersTable migration', () => {
  let source: DataSource;
  let reminders: Repository<ServiceRequestMessageReminder>;
  let before: Record<string, Record<string, unknown>[]>;
  let beforeSchema: Record<string, unknown>[];
  const migrationName = 'CreateServiceRequestMessageRemindersTable1792945282224';
  const dueAt = new Date('2026-10-25T10:05:00.000Z');
  const tables = [
    'users',
    'service_providers',
    'reviews',
    'service_offerings',
    'service_requests',
    'service_request_messages',
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
    before = await snapshot();
    beforeSchema = await schemaSnapshot();
    reminders = source.getRepository(ServiceRequestMessageReminder);
    source.migrations.push(new CreateServiceRequestMessageRemindersTable1792945282224());
  });

  afterEach(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  function addReminder(values: Partial<ServiceRequestMessageReminder> = {}) {
    return reminders.save({ serviceRequestId: 41, recipientUserId: 1, dueAt, ...values });
  }

  it('should apply only the new migration without changing existing rows, tables or indexes', async () => {
    const applied = await source.runMigrations();

    expect(applied.map((migration) => migration.name)).toEqual([migrationName]);
    expect(await snapshot()).toEqual(before);
    expect(await schemaSnapshot()).toEqual(beforeSchema);
    expect(await reminders.count()).toBe(0);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('should create the required columns, cascade foreign keys and both declared indexes', async () => {
    await source.runMigrations();
    const columns = await source.query('PRAGMA table_info(service_request_message_reminders)');
    expect(columns.map((column: { name: string }) => column.name)).toEqual([
      'id',
      'status',
      'dueAt',
      'createdAt',
      'sentAt',
      'serviceRequestId',
      'recipientUserId',
    ]);
    expect(columns).toContainEqual(
      expect.objectContaining({ name: 'sentAt', type: 'datetime', notnull: 0 }),
    );
    const foreignKeys = await source.query(
      'PRAGMA foreign_key_list(service_request_message_reminders)',
    );
    expect(foreignKeys).toHaveLength(2);
    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'serviceRequestId',
          table: 'service_requests',
          to: 'id',
          on_delete: 'CASCADE',
        }),
        expect.objectContaining({
          from: 'recipientUserId',
          table: 'users',
          to: 'id',
          on_delete: 'CASCADE',
        }),
      ]),
    );
    expect(await source.query('PRAGMA index_list(service_request_message_reminders)')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'IDX_service_request_message_reminders_status_due_at',
          unique: 0,
          partial: 0,
        }),
        expect.objectContaining({
          name: 'IDX_service_request_message_reminders_pending',
          unique: 1,
          partial: 1,
        }),
      ]),
    );
    for (const [index, expected] of [
      ['IDX_service_request_message_reminders_status_due_at', ['status', 'dueAt']],
      ['IDX_service_request_message_reminders_pending', ['serviceRequestId', 'recipientUserId']],
    ] as const) {
      const info = await source.query(`PRAGMA index_info("${index}")`);
      expect(info.map((column: { name: string }) => column.name)).toEqual(expected);
    }
  });

  it('should persist default pending state, dates and both relations without affecting the conversation', async () => {
    await source.runMigrations();
    const saved = await addReminder();
    const row = await reminders.findOneOrFail({
      where: { id: saved.id },
      relations: { serviceRequest: true, recipientUser: true },
    });

    expect(row.id).toBeGreaterThan(0);
    expect(row.status).toBe(ReminderStatus.PENDING);
    expect(row.dueAt).toEqual(dueAt);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(Number.isNaN(row.createdAt.getTime())).toBe(false);
    expect(row.sentAt).toBeNull();
    expect(row.serviceRequest.id).toBe(41);
    expect(row.recipientUser.id).toBe(1);
    expect(row.recipientUser.passwordHash).toBeUndefined();
    expect(await snapshot()).toEqual(before);
  });

  it('should reject a second pending reminder for the same request and recipient', async () => {
    await source.runMigrations();
    const original = await addReminder();

    await expect(addReminder({ dueAt: new Date('2026-10-25T11:00:00.000Z') })).rejects.toThrow(
      /UNIQUE constraint failed/,
    );

    expect(await reminders.find()).toEqual([original]);
  });

  it('should reject changing a historical reminder to pending when that pair already has one', async () => {
    await source.runMigrations();
    await addReminder();
    const historical = await addReminder({
      status: ReminderStatus.SENT,
      sentAt: new Date('2026-10-25T09:00:00.000Z'),
    });

    await expect(
      reminders.update(historical.id, { status: ReminderStatus.PENDING }),
    ).rejects.toThrow(/UNIQUE constraint failed/);

    expect((await reminders.findOneByOrFail({ id: historical.id })).status).toBe(
      ReminderStatus.SENT,
    );
    expect(await reminders.count()).toBe(2);
  });

  it.each([ReminderStatus.SENT, ReminderStatus.CANCELLED])(
    'should preserve multiple %s reminders and permit a new pending reminder after finalizing the old one',
    async (status) => {
      await source.runMigrations();
      const first = await addReminder();
      const sentAt = status === ReminderStatus.SENT ? new Date('2026-10-25T10:06:00.000Z') : null;
      await reminders.update(first.id, { status, sentAt });
      await addReminder({ status, sentAt });

      const pending = await addReminder();

      expect(pending.status).toBe(ReminderStatus.PENDING);
      expect(await reminders.countBy({ serviceRequestId: 41, recipientUserId: 1 })).toBe(3);
      expect(await reminders.countBy({ status: ReminderStatus.PENDING })).toBe(1);
    },
  );

  it('should allow one pending reminder for each request and recipient pair independently', async () => {
    await source.runMigrations();
    await addReminder({ recipientUserId: 3 });
    await addReminder({ recipientUserId: 1 });
    await addReminder({ serviceRequestId: 42, recipientUserId: 3 });

    expect(await reminders.count()).toBe(3);
  });

  it.each(['status', 'dueAt', 'serviceRequestId', 'recipientUserId'])(
    'should reject a null %s value',
    async (field) => {
      await source.runMigrations();
      const values: Record<string, string | number | null> = {
        status: 'PENDING',
        dueAt: '2026-10-25 10:05:00.000',
        serviceRequestId: 41,
        recipientUserId: 1,
      };
      values[field] = null;

      await expect(
        source.query(
          'INSERT INTO service_request_message_reminders (status, dueAt, serviceRequestId, recipientUserId) VALUES (?, ?, ?, ?)',
          [values.status, values.dueAt, values.serviceRequestId, values.recipientUserId],
        ),
      ).rejects.toThrow(/NOT NULL constraint failed/);
      expect(await reminders.count()).toBe(0);
    },
  );

  it.each([
    { field: 'serviceRequestId', serviceRequestId: 999, recipientUserId: 1 },
    { field: 'recipientUserId', serviceRequestId: 41, recipientUserId: 999 },
  ])('should reject a nonexistent $field', async ({ serviceRequestId, recipientUserId }) => {
    await source.runMigrations();

    await expect(addReminder({ serviceRequestId, recipientUserId })).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    );
    expect(await reminders.count()).toBe(0);
  });

  it('should remove only the reminders for a deleted request and retain unrelated reminders', async () => {
    await source.runMigrations();
    await addReminder();
    await addReminder({ recipientUserId: 3 });
    const retained = await addReminder({ serviceRequestId: 42, recipientUserId: 2 });

    await source.query('DELETE FROM service_requests WHERE id = 41');

    expect(await reminders.find()).toEqual([retained]);
    expect(await source.query('SELECT id FROM service_requests ORDER BY id')).toEqual([
      { id: 42 },
      { id: 43 },
    ]);
    expect(await source.query('SELECT id FROM service_request_messages ORDER BY id')).toEqual([
      { id: 52 },
    ]);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('should cascade recipient deletion without removing the request or another recipient reminder', async () => {
    await source.runMigrations();
    // Isolate the reminder foreign key from request and message account references.
    await addReminder({ recipientUserId: 4 });
    const retained = await addReminder();

    await source.query('DELETE FROM users WHERE id = 4');

    expect(await reminders.find()).toEqual([retained]);
    expect(await source.query('SELECT id FROM service_requests ORDER BY id')).toEqual([
      { id: 41 },
      { id: 42 },
      { id: 43 },
    ]);
    expect(await source.query('SELECT id FROM service_request_messages ORDER BY id')).toEqual([
      { id: 51 },
      { id: 52 },
    ]);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('should retain reminders and due dates after offering and provider deletion', async () => {
    await source.runMigrations();
    const original = await addReminder();

    await source.query('DELETE FROM service_offerings WHERE id = 21');
    expect(await reminders.find()).toEqual([original]);
    await source.query('DELETE FROM service_providers WHERE id = 13');
    expect(await reminders.find()).toEqual([original]);
    expect(
      await source.query(
        'SELECT serviceOfferingId, serviceProviderId FROM service_requests WHERE id = 41',
      ),
    ).toEqual([{ serviceOfferingId: null, serviceProviderId: null }]);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('should select only pending reminders whose due date has been reached, including the exact boundary', async () => {
    await source.runMigrations();
    const now = new Date('2026-10-25T10:05:00.000Z');
    const earlier = await addReminder({
      recipientUserId: 3,
      dueAt: new Date('2026-10-25T10:04:59.999Z'),
    });
    const current = await addReminder({ dueAt: now });
    await addReminder({
      serviceRequestId: 42,
      recipientUserId: 3,
      dueAt: new Date('2026-10-25T10:05:00.001Z'),
    });
    await addReminder({
      serviceRequestId: 42,
      recipientUserId: 2,
      status: ReminderStatus.SENT,
      dueAt: new Date('2026-10-25T10:00:00.000Z'),
    });

    const due = await reminders.find({
      where: { status: ReminderStatus.PENDING, dueAt: LessThanOrEqual(now) },
      order: { dueAt: 'ASC', id: 'ASC' },
    });

    expect(due.map((reminder) => reminder.id)).toEqual([earlier.id, current.id]);
  });

  it('should revert and reapply only the new table while preserving existing rows and schema', async () => {
    await source.runMigrations();
    await addReminder();

    await source.undoLastMigration();

    expect(
      await source.query(
        "SELECT name FROM sqlite_master WHERE name = 'service_request_message_reminders' OR name LIKE 'IDX_service_request_message_reminders_%'",
      ),
    ).toEqual([]);
    expect(await snapshot()).toEqual(before);
    expect(await schemaSnapshot()).toEqual(beforeSchema);
    expect((await source.runMigrations()).map((migration) => migration.name)).toEqual([
      migrationName,
    ]);
    expect(await reminders.count()).toBe(0);
    expect(await snapshot()).toEqual(before);
    expect(await schemaSnapshot()).toEqual(beforeSchema);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
