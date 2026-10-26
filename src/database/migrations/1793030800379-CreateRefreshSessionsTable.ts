import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshSessionsTable1793030800379 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_sessions" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "tokenHash" varchar(64) NOT NULL,
        "expiresAt" datetime NOT NULL,
        "revokedAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "userId" integer NOT NULL,
        CONSTRAINT "FK_refresh_sessions_user"
          FOREIGN KEY ("userId") REFERENCES "users" ("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_refresh_sessions_token_hash"
      ON "refresh_sessions" ("tokenHash")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_sessions_user_id"
      ON "refresh_sessions" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "refresh_sessions"');
  }
}
