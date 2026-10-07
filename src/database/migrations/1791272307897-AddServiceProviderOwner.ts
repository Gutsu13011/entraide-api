import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddServiceProviderOwner1791272307897 implements MigrationInterface {
  name = 'AddServiceProviderOwner1791272307897';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "temporary_service_providers" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "firstName" varchar NOT NULL,
        "lastName" varchar NOT NULL,
        "profession" varchar NOT NULL,
        "city" varchar NOT NULL,
        "description" text NOT NULL,
        "hourlyRate" real NOT NULL,
        "available" boolean NOT NULL,
        "imageUrl" varchar NOT NULL,
        "ownerUserId" integer,
        CONSTRAINT "UQ_ca864e690266990affa3fce5646"
          UNIQUE ("ownerUserId"),
        CONSTRAINT "FK_service_providers_owner_user"
          FOREIGN KEY ("ownerUserId")
          REFERENCES "users" ("id")
          ON DELETE RESTRICT
          ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      INSERT INTO "temporary_service_providers" (
        "id", "firstName", "lastName", "profession", "city",
        "description", "hourlyRate", "available", "imageUrl"
      )
      SELECT
        "id", "firstName", "lastName", "profession", "city",
        "description", "hourlyRate", "available", "imageUrl"
      FROM "service_providers"
    `);

    await queryRunner.query(`DROP TABLE "service_providers"`);

    await queryRunner.query(`
      ALTER TABLE "temporary_service_providers"
      RENAME TO "service_providers"
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_service_providers_city"
      ON "service_providers" ("city")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.isTransactionActive) {
      throw new Error('Revert this migration with --transaction none to preserve related data.');
    }

    await queryRunner.query(`
      CREATE TABLE "temporary_service_providers" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "firstName" varchar NOT NULL,
        "lastName" varchar NOT NULL,
        "profession" varchar NOT NULL,
        "city" varchar NOT NULL,
        "description" text NOT NULL,
        "hourlyRate" real NOT NULL,
        "available" boolean NOT NULL,
        "imageUrl" varchar NOT NULL
      )
    `);

    await queryRunner.query(`
      INSERT INTO "temporary_service_providers" (
        "id", "firstName", "lastName", "profession", "city",
        "description", "hourlyRate", "available", "imageUrl"
      )
      SELECT
        "id", "firstName", "lastName", "profession", "city",
        "description", "hourlyRate", "available", "imageUrl"
      FROM "service_providers"
    `);

    await queryRunner.query(`DROP TABLE "service_providers"`);

    await queryRunner.query(`
      ALTER TABLE "temporary_service_providers"
      RENAME TO "service_providers"
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_service_providers_city"
      ON "service_providers" ("city")
    `);
  }
}
