import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1789026143459 implements MigrationInterface {
  name = 'InitialSchema1789026143459';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "service_providers" (
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "service_providers"
        `);
  }
}
