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

describe('LinkReviewsToServiceRequests migration', () => {
  let source: DataSource;
  const migrationName = 'LinkReviewsToServiceRequests1792425147989';
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
      migrations: [
        InitialSchema1789026143459,
        AddCityIndex1789287684113,
        CreateReviewsTable1789293137887,
        CreateServiceOfferingsTable1790070822998,
        CreateUsersTable1790601439138,
        AddServiceProviderOwner1791272307897,
        CreateServiceRequestsTable1791550235362,
        AddServiceRequestProvider1792423748325,
      ],
    });
    await source.initialize();
    await source.runMigrations();
    for (const [id, name] of [
      [1, 'Alice'],
      [2, 'Bruno'],
      [3, 'Chloé'],
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
    source.migrations.push(new LinkReviewsToServiceRequests1792425147989());
  });

  afterEach(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  it('should preserve legacy reviews with null request links and leave other data unchanged', async () => {
    const applied = await source.runMigrations();
    expect(applied.map((migration) => migration.name)).toEqual([migrationName]);

    const after = await snapshot();
    expect(after.reviews).toEqual(
      before.reviews.map((review) => ({ ...review, serviceRequestId: null })),
    );
    for (const table of tables.filter((table) => table !== 'reviews')) {
      expect(after[table]).toEqual(before[table]);
    }
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('should create a nullable request foreign key and a unique index on that column', async () => {
    await source.runMigrations();
    expect(await source.query('PRAGMA table_info(reviews)')).toContainEqual(
      expect.objectContaining({ name: 'serviceRequestId', notnull: 0 }),
    );
    expect(await source.query('PRAGMA index_list(reviews)')).toContainEqual(
      expect.objectContaining({ name: 'UQ_reviews_service_request_id', unique: 1 }),
    );
    expect(await source.query('PRAGMA index_info(UQ_reviews_service_request_id)')).toEqual([
      expect.objectContaining({ name: 'serviceRequestId' }),
    ]);
    expect(await source.query('PRAGMA foreign_key_list(reviews)')).toContainEqual(
      expect.objectContaining({
        from: 'serviceRequestId',
        table: 'service_requests',
        to: 'id',
        on_delete: 'RESTRICT',
      }),
    );
    await expect(
      source.query('UPDATE reviews SET serviceRequestId = 999 WHERE id = 31'),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    expect(await source.query('SELECT serviceRequestId FROM reviews WHERE id = 31')).toEqual([
      { serviceRequestId: null },
    ]);
  });

  it('should reject duplicate request links on insert and update while allowing distinct requests for one provider', async () => {
    await source.runMigrations();
    await source.query('UPDATE reviews SET serviceRequestId = 41 WHERE id = 31');
    await expect(
      source.query('UPDATE reviews SET serviceRequestId = 41 WHERE id = 32'),
    ).rejects.toThrow(/UNIQUE constraint failed/);
    await expect(
      source.query(`INSERT INTO reviews
        (authorName, rating, comment, serviceProviderId, serviceRequestId)
        VALUES ('Doublon', 5, 'Avis en double', 13, 41)`),
    ).rejects.toThrow(/UNIQUE constraint failed/);

    // A second completed request to the same provider permits a separate review.
    await source.query(`INSERT INTO service_requests
      (id, message, status, offeringTitleSnapshot, offeringPricingTypeSnapshot,
       offeringHourlyRateSnapshot, requesterUserId, recipientUserId, serviceOfferingId, serviceProviderId)
      VALUES (44, 'Autre prestation', 'COMPLETED', 'Peinture', 'HOURLY', 35, 3, 1, 21, 13)`);
    await source.query('UPDATE reviews SET serviceRequestId = 44 WHERE id = 32');
    expect(await source.query('SELECT id, serviceRequestId FROM reviews ORDER BY id')).toEqual([
      { id: 31, serviceRequestId: 41 },
      { id: 32, serviceRequestId: 44 },
    ]);
  });

  it('should prevent deletion of a reviewed request until its review is removed', async () => {
    await source.runMigrations();
    await source.query('UPDATE reviews SET serviceRequestId = 41 WHERE id = 31');

    await expect(source.query('DELETE FROM service_requests WHERE id = 41')).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    );
    expect(await source.query('SELECT id FROM service_requests WHERE id = 41')).toEqual([
      { id: 41 },
    ]);
    await source.query('DELETE FROM reviews WHERE id = 31');
    await source.query('DELETE FROM service_requests WHERE id = 41');
    expect(await source.query('SELECT id FROM service_requests WHERE id = 41')).toEqual([]);
  });

  it('should preserve the linked review after offering deletion and retain the request after provider deletion', async () => {
    await source.runMigrations();
    await source.query('UPDATE reviews SET serviceRequestId = 41 WHERE id = 31');
    const [originalRequest] = await source.query('SELECT * FROM service_requests WHERE id = 41');
    const [originalReview] = await source.query('SELECT * FROM reviews WHERE id = 31');

    await source.query('DELETE FROM service_offerings WHERE id = 21');
    expect(await source.query('SELECT * FROM reviews WHERE id = 31')).toEqual([originalReview]);
    expect(await source.query('SELECT * FROM service_requests WHERE id = 41')).toEqual([
      { ...originalRequest, serviceOfferingId: null },
    ]);

    await source.query('DELETE FROM service_providers WHERE id = 13');
    expect(await source.query('SELECT * FROM reviews WHERE serviceProviderId = 13')).toEqual([]);
    expect(await source.query('SELECT * FROM service_requests WHERE id = 41')).toEqual([
      { ...originalRequest, serviceOfferingId: null, serviceProviderId: null },
    ]);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('should revert and reapply without losing reviews while clearing the removed associations', async () => {
    await source.runMigrations();
    await source.query('UPDATE reviews SET serviceRequestId = 41 WHERE id = 31');

    await source.undoLastMigration();

    expect(await snapshot()).toEqual(before);
    expect(await source.query('PRAGMA table_info(reviews)')).not.toContainEqual(
      expect.objectContaining({ name: 'serviceRequestId' }),
    );
    expect(await source.query('PRAGMA index_list(reviews)')).not.toContainEqual(
      expect.objectContaining({ name: 'UQ_reviews_service_request_id' }),
    );
    await source.runMigrations();
    expect((await snapshot()).reviews).toEqual(
      before.reviews.map((review) => ({ ...review, serviceRequestId: null })),
    );
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
