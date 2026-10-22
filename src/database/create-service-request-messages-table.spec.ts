import { DataSource } from 'typeorm';
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

describe('CreateServiceRequestMessagesTable migration', () => {
  let source: DataSource;
  const migrationName = 'CreateServiceRequestMessagesTable1792655516545';
  const tables = ['users', 'service_providers', 'reviews', 'service_offerings', 'service_requests'];
  let before: Record<string, Record<string, unknown>[]>;

  async function snapshot() {
    const entries = await Promise.all(
      tables.map(
        async (table) =>
          [table, await source.query(`SELECT * FROM "${table}" ORDER BY id`)] as const,
      ),
    );
    return Object.fromEntries(entries) as Record<string, Record<string, unknown>[]>;
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
      ],
    });
    await source.initialize();
    await source.runMigrations();
    for (const [id, name] of [
      [1, 'Alice'],
      [2, 'Bruno'],
      [3, 'Chloé'],
      [4, 'Auteur'],
    ] as const) {
      await source.query(
        `INSERT INTO users (id, firstName, lastName, email, passwordHash)
        VALUES (?, ?, 'Test', ?, 'test-only-hash')`,
        [id, name, `user${id}@example.test`],
      );
    }
    for (const [id, owner] of [
      [13, 1],
      [14, 2],
    ] as const) {
      await source.query(
        `INSERT INTO service_providers
        (id, firstName, lastName, profession, city, description, hourlyRate, available, imageUrl, ownerUserId)
        VALUES (?, 'Prestataire', 'Test', 'Conseil', 'Paris', 'Conseil de démonstration', 35, 1, '', ?)`,
        [id, owner],
      );
    }
    await source.query(`INSERT INTO service_offerings
      (id, title, description, pricingType, hourlyRate, serviceProviderId)
      VALUES (21, 'Peinture', 'Peinture intérieure', 'HOURLY', 35, 13),
        (22, 'Conseil', 'Conseil gratuit', 'FREE', NULL, 14)`);
    await source.query(`INSERT INTO reviews (id, authorName, rating, comment, serviceProviderId)
      VALUES (31, 'Auteur historique', 5, 'Très bien', 13),
        (32, 'Autre auteur historique', 4, 'Bien', 13)`);
    await source.query(`INSERT INTO service_requests
      (id, message, status, createdAt, offeringTitleSnapshot, offeringPricingTypeSnapshot,
       offeringHourlyRateSnapshot, requesterUserId, recipientUserId, serviceOfferingId)
      VALUES (41, 'Peindre une chambre', 'COMPLETED', '2026-10-01 10:00:00', 'Peinture historique', 'HOURLY', 30, 3, 1, 21),
        (42, 'Un conseil', 'SENT', '2026-10-02 10:00:00', 'Conseil', 'FREE', NULL, 3, 2, 22),
        (43, 'Offre déjà supprimée', 'ACCEPTED', '2026-10-03 10:00:00', 'Ancienne offre', 'FREE', NULL, 3, 1, NULL)`);
    await source.query('UPDATE service_requests SET serviceProviderId = 13 WHERE id = 41');
    before = await snapshot();
    // Let the real migration executor apply only the newly introduced migration.
    source.migrations.push(new CreateServiceRequestMessagesTable1792655516545());
  });

  afterEach(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  async function addMessage(
    requestId = 41,
    authorId = 3,
    content = 'Bonjour, disponible samedi ?',
  ) {
    return source.getRepository(ServiceRequestMessage).save({
      content,
      serviceRequestId: requestId,
      authorUserId: authorId,
    });
  }

  it('should apply only the new migration and preserve every existing table row', async () => {
    const applied = await source.runMigrations();

    expect(applied.map((migration) => migration.name)).toEqual([migrationName]);
    expect(await snapshot()).toEqual(before);
    expect(await source.getRepository(ServiceRequestMessage).count()).toBe(0);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('should create the declared columns, non-unique indexes and foreign key actions', async () => {
    await source.runMigrations();
    const columns = await source.query('PRAGMA table_info(service_request_messages)');
    expect(columns.map((column: { name: string }) => column.name)).toEqual([
      'id',
      'content',
      'createdAt',
      'readAt',
      'serviceRequestId',
      'authorUserId',
    ]);
    expect(columns).toContainEqual(
      expect.objectContaining({ name: 'readAt', type: 'datetime', notnull: 0 }),
    );
    expect(await source.query('PRAGMA foreign_key_list(service_request_messages)')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'serviceRequestId',
          table: 'service_requests',
          to: 'id',
          on_delete: 'CASCADE',
        }),
        expect.objectContaining({
          from: 'authorUserId',
          table: 'users',
          to: 'id',
          on_delete: 'RESTRICT',
        }),
      ]),
    );
    const indexes = await source.query('PRAGMA index_list(service_request_messages)');
    expect(indexes).toHaveLength(2);
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'IDX_service_request_messages_request_created_at_id',
          unique: 0,
        }),
        expect.objectContaining({ name: 'IDX_service_request_messages_author_user_id', unique: 0 }),
      ]),
    );
    const orderedColumns = await source.query(
      'PRAGMA index_info(IDX_service_request_messages_request_created_at_id)',
    );
    expect(orderedColumns.map((column: { name: string }) => column.name)).toEqual([
      'serviceRequestId',
      'createdAt',
      'id',
    ]);
    expect(
      await source.query('PRAGMA index_info(IDX_service_request_messages_author_user_id)'),
    ).toEqual([expect.objectContaining({ name: 'authorUserId' })]);
  });

  it('should store an unread message with an automatic creation date, load both relations and retain an explicit read date', async () => {
    await source.runMigrations();
    const saved = await addMessage();
    const repository = source.getRepository(ServiceRequestMessage);
    const unread = await repository.findOneOrFail({
      where: { id: saved.id },
      relations: { serviceRequest: true, authorUser: true },
    });

    expect(unread.id).toBeGreaterThan(0);
    expect(unread.content).toBe('Bonjour, disponible samedi ?');
    expect(unread.createdAt).toBeInstanceOf(Date);
    expect(Number.isNaN(unread.createdAt.getTime())).toBe(false);
    expect(unread.readAt).toBeNull();
    expect(unread.serviceRequest.id).toBe(41);
    expect(unread.authorUser.id).toBe(3);
    const readAt = new Date('2026-10-22T12:00:00.000Z');
    await repository.update(saved.id, { readAt });
    const read = await repository.findOneByOrFail({ id: saved.id });
    expect(read.readAt).toEqual(readAt);
    expect(read.createdAt).toEqual(unread.createdAt);
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    { field: 'serviceRequestId', serviceRequestId: 999, authorUserId: 3 },
    { field: 'authorUserId', serviceRequestId: 41, authorUserId: 999 },
  ])('should reject a nonexistent $field', async ({ serviceRequestId, authorUserId }) => {
    await source.runMigrations();

    await expect(
      source.query(
        'INSERT INTO service_request_messages (content, serviceRequestId, authorUserId) VALUES (?, ?, ?)',
        ['Message', serviceRequestId, authorUserId],
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    expect(await source.getRepository(ServiceRequestMessage).count()).toBe(0);
  });

  it.each(['content', 'serviceRequestId', 'authorUserId'])(
    'should reject a null %s value',
    async (field) => {
      await source.runMigrations();
      const values: Record<string, string | number | null> = {
        content: 'Message',
        serviceRequestId: 41,
        authorUserId: 3,
      };
      values[field] = null;
      await expect(
        source.query(
          'INSERT INTO service_request_messages (content, serviceRequestId, authorUserId) VALUES (?, ?, ?)',
          [values.content, values.serviceRequestId, values.authorUserId],
        ),
      ).rejects.toThrow(/NOT NULL constraint failed/);
    },
  );

  it('should allow multiple messages from one author in one request and order equal timestamps by id', async () => {
    await source.runMigrations();
    const repository = source.getRepository(ServiceRequestMessage);
    const createdAt = new Date('2026-10-22T10:00:00.000Z');
    const first = await repository.save({
      content: 'Premier',
      serviceRequestId: 41,
      authorUserId: 3,
      createdAt,
    });
    const second = await repository.save({
      content: 'Deuxième',
      serviceRequestId: 41,
      authorUserId: 3,
      createdAt,
    });
    await repository.save({
      content: 'Autre discussion',
      serviceRequestId: 42,
      authorUserId: 3,
      createdAt,
    });

    const messages = await repository.find({
      where: { serviceRequestId: 41 },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    expect(messages.map((message) => message.id)).toEqual([first.id, second.id]);
    expect(messages.map((message) => message.content)).toEqual(['Premier', 'Deuxième']);
  });

  it('should delete only the messages belonging to a deleted request', async () => {
    await source.runMigrations();
    await addMessage(41);
    await addMessage(41, 1, 'Oui, samedi matin.');
    const retained = await addMessage(42);

    await source.query('DELETE FROM service_requests WHERE id = 41');

    expect(await source.getRepository(ServiceRequestMessage).find()).toEqual([retained]);
    expect(await source.query('SELECT id FROM users ORDER BY id')).toHaveLength(4);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('should restrict author deletion even when no other table references that account', async () => {
    await source.runMigrations();
    // Isolate the message foreign key from the existing request participant constraints.
    const message = await addMessage(41, 4);

    await expect(source.query('DELETE FROM users WHERE id = 4')).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    );

    expect(await source.getRepository(ServiceRequestMessage).find()).toEqual([message]);
    expect(await source.query('SELECT id FROM users WHERE id = 4')).toEqual([{ id: 4 }]);
  });

  it('should retain messages and read dates after offering and provider deletion', async () => {
    await source.runMigrations();
    const message = await addMessage();
    const repository = source.getRepository(ServiceRequestMessage);
    await repository.update(message.id, { readAt: new Date('2026-10-22T12:00:00.000Z') });
    const original = await repository.findOneByOrFail({ id: message.id });

    await source.query('DELETE FROM service_offerings WHERE id = 21');
    expect(await repository.find()).toEqual([original]);
    await source.query('DELETE FROM service_providers WHERE id = 13');
    expect(await repository.find()).toEqual([original]);
    expect(
      await source.query(
        'SELECT serviceOfferingId, serviceProviderId FROM service_requests WHERE id = 41',
      ),
    ).toEqual([{ serviceOfferingId: null, serviceProviderId: null }]);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('should revert and reapply the new table without changing preexisting data', async () => {
    await source.runMigrations();
    await addMessage();

    await source.undoLastMigration();

    expect(
      await source.query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'service_request_messages'",
      ),
    ).toEqual([]);
    expect(
      await source.query(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'IDX_service_request_messages_%'",
      ),
    ).toEqual([]);
    expect(await snapshot()).toEqual(before);
    await source.runMigrations();
    expect(await source.getRepository(ServiceRequestMessage).count()).toBe(0);
    expect(await snapshot()).toEqual(before);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
