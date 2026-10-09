import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateServiceRequestsTable1791550235362 implements MigrationInterface {
  name = 'CreateServiceRequestsTable1791550235362';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "service_requests" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "message" text NOT NULL,
        "status" varchar NOT NULL DEFAULT ('SENT'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "offeringTitleSnapshot" varchar NOT NULL,
        "offeringPricingTypeSnapshot" varchar NOT NULL,
        "offeringHourlyRateSnapshot" real,
        "requesterUserId" integer NOT NULL,
        "recipientUserId" integer NOT NULL,
        "serviceOfferingId" integer,
        CONSTRAINT "CHK_service_requests_snapshot_pricing"
          CHECK (
            (
              "offeringPricingTypeSnapshot" = 'FREE'
              AND "offeringHourlyRateSnapshot" IS NULL
            )
            OR
            (
              "offeringPricingTypeSnapshot" = 'HOURLY'
              AND "offeringHourlyRateSnapshot" IS NOT NULL
              AND "offeringHourlyRateSnapshot" > 0
            )
          ),
        CONSTRAINT "FK_service_requests_requester_user"
          FOREIGN KEY ("requesterUserId")
          REFERENCES "users" ("id")
          ON DELETE RESTRICT
          ON UPDATE NO ACTION,
        CONSTRAINT "FK_service_requests_recipient_user"
          FOREIGN KEY ("recipientUserId")
          REFERENCES "users" ("id")
          ON DELETE RESTRICT
          ON UPDATE NO ACTION,
        CONSTRAINT "FK_service_requests_service_offering"
          FOREIGN KEY ("serviceOfferingId")
          REFERENCES "service_offerings" ("id")
          ON DELETE SET NULL
          ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_service_requests_requester_user_id"
      ON "service_requests" ("requesterUserId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_service_requests_recipient_user_id"
      ON "service_requests" ("recipientUserId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_service_requests_service_offering_id"
      ON "service_requests" ("serviceOfferingId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "service_requests"`);
  }
}
