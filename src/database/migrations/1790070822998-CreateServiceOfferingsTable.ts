import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateServiceOfferingsTable1790070822998 implements MigrationInterface {
  name = 'CreateServiceOfferingsTable1790070822998';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "service_offerings" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "title" varchar NOT NULL,
        "description" text NOT NULL,
        "pricingType" varchar NOT NULL,
        "hourlyRate" real,
        "serviceProviderId" integer NOT NULL,
        CONSTRAINT "CHK_service_offerings_pricing"
          CHECK (
            ("pricingType" = 'FREE' AND "hourlyRate" IS NULL)
            OR ("pricingType" = 'HOURLY' AND "hourlyRate" IS NOT NULL AND "hourlyRate" > 0)
          ),
        CONSTRAINT "FK_service_offerings_service_provider"
          FOREIGN KEY ("serviceProviderId")
          REFERENCES "service_providers" ("id")
          ON DELETE CASCADE
          ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_service_offerings_service_provider_id"
      ON "service_offerings" ("serviceProviderId")
    `);

    await queryRunner.query(`
      INSERT INTO "service_offerings" (
        "title",
        "description",
        "pricingType",
        "hourlyRate",
        "serviceProviderId"
      )
      SELECT
        "profession",
        "description",
        'HOURLY',
        "hourlyRate",
        "id"
      FROM "service_providers"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_service_offerings_service_provider_id"
    `);

    await queryRunner.query(`
      DROP TABLE "service_offerings"
    `);
  }
}
