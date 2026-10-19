import { DataSource } from 'typeorm';
import { InitialSchema1789026143459 } from './migrations/1789026143459-InitialSchema.js';
import { AddCityIndex1789287684113 } from './migrations/1789287684113-AddCityIndex.js';
import { CreateReviewsTable1789293137887 } from './migrations/1789293137887-CreateReviewsTable.js';
import { CreateServiceOfferingsTable1790070822998 } from './migrations/1790070822998-CreateServiceOfferingsTable.js';
import { CreateUsersTable1790601439138 } from './migrations/1790601439138-CreateUsersTable.js';
import { AddServiceProviderOwner1791272307897 } from './migrations/1791272307897-AddServiceProviderOwner.js';
import { CreateServiceRequestsTable1791550235362 } from './migrations/1791550235362-CreateServiceRequestsTable.js';
import { AddServiceRequestProvider1792423748325 } from './migrations/1792423748325-AddServiceRequestProvider.js';

describe('AddServiceRequestProvider migration', () => {
  let source: DataSource;
  const migrationName = 'AddServiceRequestProvider1792423748325';
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
      VALUES (31, 'Auteur historique', 5, 'Très bien', 13)`);
    await source.query(`INSERT INTO service_requests
      (id, message, status, createdAt, offeringTitleSnapshot, offeringPricingTypeSnapshot,
       offeringHourlyRateSnapshot, requesterUserId, recipientUserId, serviceOfferingId)
      VALUES (41, 'Peindre une chambre', 'COMPLETED', '2026-10-01 10:00:00', 'Peinture historique', 'HOURLY', 30, 3, 1, 21),
        (42, 'Un conseil', 'SENT', '2026-10-02 10:00:00', 'Conseil', 'FREE', NULL, 3, 2, 22),
        (43, 'Offre déjà supprimée', 'ACCEPTED', '2026-10-03 10:00:00', 'Ancienne offre', 'FREE', NULL, 3, 1, NULL)`);
    before = await snapshot();
    // Let the real migration executor apply only the newly introduced migration.
    source.migrations.push(new AddServiceRequestProvider1792423748325());
  });

  afterEach(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  it('should backfill both provider links, keep missing links null and preserve all existing data', async () => {
    const applied = await source.runMigrations();
    expect(applied.map((migration) => migration.name)).toEqual([migrationName]);
    const after = await snapshot();
    expect(after.service_requests.map((row) => [row.id, row.serviceProviderId])).toEqual([
      [41, 13],
      [42, 14],
      [43, null],
    ]);
    expect(
      after.service_requests.map((row) =>
        Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'serviceProviderId')),
      ),
    ).toEqual(before.service_requests);
    for (const table of tables.filter((table) => table !== 'service_requests')) {
      expect(after[table]).toEqual(before[table]);
    }
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('should create the nullable foreign key and index while preserving existing pricing constraints', async () => {
    await source.runMigrations();
    const columns = await source.query('PRAGMA table_info(service_requests)');
    expect(columns).toContainEqual(
      expect.objectContaining({ name: 'serviceProviderId', notnull: 0 }),
    );
    expect(await source.query('PRAGMA index_list(service_requests)')).toContainEqual(
      expect.objectContaining({ name: 'IDX_service_requests_service_provider_id' }),
    );
    expect(await source.query('PRAGMA foreign_key_list(service_requests)')).toContainEqual(
      expect.objectContaining({
        from: 'serviceProviderId',
        table: 'service_providers',
        on_delete: 'SET NULL',
      }),
    );
    await expect(
      source.query('UPDATE service_requests SET serviceProviderId = 999 WHERE id = 41'),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    await expect(
      source.query(
        "UPDATE service_requests SET offeringPricingTypeSnapshot = 'FREE' WHERE id = 41",
      ),
    ).rejects.toThrow(/CHECK constraint failed/);
    expect(
      await source.query('SELECT serviceProviderId FROM service_requests WHERE id = 41'),
    ).toEqual([{ serviceProviderId: 13 }]);
  });

  it('should keep the provider link and snapshots after offering deletion', async () => {
    await source.runMigrations();
    const [original] = await source.query('SELECT * FROM service_requests WHERE id = 41');

    await source.query('DELETE FROM service_offerings WHERE id = 21');

    expect(await source.query('SELECT * FROM service_requests WHERE id = 41')).toEqual([
      { ...original, serviceOfferingId: null },
    ]);
    expect(await source.query('SELECT id FROM service_providers WHERE id = 13')).toHaveLength(1);
    expect(await source.query('SELECT id FROM reviews WHERE id = 31')).toHaveLength(1);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('should preserve requests with null links when the provider and its offerings are deleted', async () => {
    await source.runMigrations();
    const [original] = await source.query('SELECT * FROM service_requests WHERE id = 41');

    await source.query('DELETE FROM service_providers WHERE id = 13');

    expect(await source.query('SELECT * FROM service_requests WHERE id = 41')).toEqual([
      { ...original, serviceOfferingId: null, serviceProviderId: null },
    ]);
    expect(await source.query('SELECT * FROM service_requests WHERE id = 42')).toEqual([
      { ...before.service_requests[1], serviceProviderId: 14 },
    ]);
    expect(await source.query('SELECT id FROM service_offerings WHERE id = 21')).toEqual([]);
    expect(await source.query('SELECT id FROM reviews WHERE id = 31')).toEqual([]);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('should revert and reapply the migration without losing rows or changing unrelated data', async () => {
    await source.runMigrations();
    const after = await snapshot();

    await source.undoLastMigration();

    expect(await snapshot()).toEqual(before);
    expect(await source.query('PRAGMA table_info(service_requests)')).not.toContainEqual(
      expect.objectContaining({ name: 'serviceProviderId' }),
    );
    expect(await source.query('PRAGMA index_list(service_requests)')).not.toContainEqual(
      expect.objectContaining({ name: 'IDX_service_requests_service_provider_id' }),
    );
    await source.runMigrations();
    expect(await snapshot()).toEqual(after);
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
