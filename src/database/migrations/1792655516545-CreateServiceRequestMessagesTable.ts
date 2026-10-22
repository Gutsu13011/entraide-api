import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateServiceRequestMessagesTable1792655516545 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "service_request_messages" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "content" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "readAt" datetime,
        "serviceRequestId" integer NOT NULL,
        "authorUserId" integer NOT NULL,
        CONSTRAINT "FK_service_request_messages_request"
          FOREIGN KEY ("serviceRequestId") REFERENCES "service_requests" ("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_service_request_messages_author"
          FOREIGN KEY ("authorUserId") REFERENCES "users" ("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_service_request_messages_request_created_at_id"
      ON "service_request_messages" ("serviceRequestId", "createdAt", "id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_service_request_messages_author_user_id"
      ON "service_request_messages" ("authorUserId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "service_request_messages"');
  }
}
