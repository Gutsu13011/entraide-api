import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddServiceRequestProvider1792423748325 implements MigrationInterface {
  name = 'AddServiceRequestProvider1792423748325';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "service_requests"
      ADD COLUMN "serviceProviderId" integer
      CONSTRAINT "FK_service_requests_service_provider"
      REFERENCES "service_providers" ("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      UPDATE "service_requests"
      SET "serviceProviderId" = (
        SELECT "serviceProviderId"
        FROM "service_offerings"
        WHERE "service_offerings"."id" =
              "service_requests"."serviceOfferingId"
      )
      WHERE "serviceOfferingId" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_service_requests_service_provider_id"
      ON "service_requests" ("serviceProviderId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_service_requests_service_provider_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "service_requests"
      DROP COLUMN "serviceProviderId"
    `);
  }
}
