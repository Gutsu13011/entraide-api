import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReviewsTable1789293137887 implements MigrationInterface {
  name = 'CreateReviewsTable1789293137887';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "reviews" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "authorName" varchar NOT NULL,
                "rating" integer NOT NULL,
                "comment" text NOT NULL,
                "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
                "serviceProviderId" integer NOT NULL
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_reviews_service_provider_id" ON "reviews" ("serviceProviderId")
        `);
    await queryRunner.query(`
            DROP INDEX "IDX_reviews_service_provider_id"
        `);
    await queryRunner.query(`
            CREATE TABLE "temporary_reviews" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "authorName" varchar NOT NULL,
                "rating" integer NOT NULL,
                "comment" text NOT NULL,
                "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
                "serviceProviderId" integer NOT NULL,
                CONSTRAINT "FK_reviews_service_provider" FOREIGN KEY ("serviceProviderId") REFERENCES "service_providers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
        `);
    await queryRunner.query(`
            INSERT INTO "temporary_reviews"(
                    "id",
                    "authorName",
                    "rating",
                    "comment",
                    "createdAt",
                    "serviceProviderId"
                )
            SELECT "id",
                "authorName",
                "rating",
                "comment",
                "createdAt",
                "serviceProviderId"
            FROM "reviews"
        `);
    await queryRunner.query(`
            DROP TABLE "reviews"
        `);
    await queryRunner.query(`
            ALTER TABLE "temporary_reviews"
                RENAME TO "reviews"
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_reviews_service_provider_id" ON "reviews" ("serviceProviderId")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "IDX_reviews_service_provider_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "reviews"
                RENAME TO "temporary_reviews"
        `);
    await queryRunner.query(`
            CREATE TABLE "reviews" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "authorName" varchar NOT NULL,
                "rating" integer NOT NULL,
                "comment" text NOT NULL,
                "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
                "serviceProviderId" integer NOT NULL
            )
        `);
    await queryRunner.query(`
            INSERT INTO "reviews"(
                    "id",
                    "authorName",
                    "rating",
                    "comment",
                    "createdAt",
                    "serviceProviderId"
                )
            SELECT "id",
                "authorName",
                "rating",
                "comment",
                "createdAt",
                "serviceProviderId"
            FROM "temporary_reviews"
        `);
    await queryRunner.query(`
            DROP TABLE "temporary_reviews"
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_reviews_service_provider_id" ON "reviews" ("serviceProviderId")
        `);
    await queryRunner.query(`
            DROP INDEX "IDX_reviews_service_provider_id"
        `);
    await queryRunner.query(`
            DROP TABLE "reviews"
        `);
  }
}
