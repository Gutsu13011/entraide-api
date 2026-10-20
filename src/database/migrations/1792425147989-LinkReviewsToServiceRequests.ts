import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkReviewsToServiceRequests1792425147989 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
    ALTER TABLE "reviews"
    ADD COLUMN "serviceRequestId" integer
    CONSTRAINT "FK_reviews_service_request"
    REFERENCES "service_requests" ("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION
  `);

    await queryRunner.query(`
    CREATE UNIQUE INDEX "UQ_reviews_service_request_id"
    ON "reviews" ("serviceRequestId")
  `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
    DROP INDEX "UQ_reviews_service_request_id"
  `);

    await queryRunner.query(`
    ALTER TABLE "reviews"
    DROP COLUMN "serviceRequestId"
  `);
  }
}
