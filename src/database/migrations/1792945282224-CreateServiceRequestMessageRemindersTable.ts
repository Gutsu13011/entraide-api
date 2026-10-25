import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateServiceRequestMessageRemindersTable1792945282224 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "service_request_message_reminders" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "status" varchar NOT NULL DEFAULT ('PENDING'),
        "dueAt" datetime NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "sentAt" datetime,
        "serviceRequestId" integer NOT NULL,
        "recipientUserId" integer NOT NULL,
        CONSTRAINT "FK_service_request_message_reminders_request"
          FOREIGN KEY ("serviceRequestId") REFERENCES "service_requests" ("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_service_request_message_reminders_recipient"
          FOREIGN KEY ("recipientUserId") REFERENCES "users" ("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_service_request_message_reminders_status_due_at"
      ON "service_request_message_reminders" ("status", "dueAt")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_service_request_message_reminders_pending"
      ON "service_request_message_reminders" ("serviceRequestId", "recipientUserId")
      WHERE "status" = 'PENDING'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "service_request_message_reminders"');
  }
}
