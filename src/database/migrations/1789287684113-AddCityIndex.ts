import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCityIndex1789287684113 implements MigrationInterface {
  name = 'AddCityIndex1789287684113';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE INDEX "IDX_service_providers_city" ON "service_providers" ("city")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "IDX_service_providers_city"
        `);
  }
}
