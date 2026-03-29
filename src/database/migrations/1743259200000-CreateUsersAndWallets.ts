import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAndWallets1743259200000 implements MigrationInterface {
  name = 'CreateUsersAndWallets1743259200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "google_id"   VARCHAR NOT NULL UNIQUE,
        "email"       VARCHAR NOT NULL UNIQUE,
        "name"        VARCHAR,
        "avatar_url"  VARCHAR,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallets" (
        "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"    UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "balance"    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "wallets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
