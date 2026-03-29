import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { join } from 'path';

@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    const isProd = this.configService.get('APP_ENV') === 'production';

    return {
      type: 'postgres',
      host: this.configService.get<string>('DB_HOST'),
      port: this.configService.get<number>('DB_PORT'),
      username: this.configService.get<string>('DB_USERNAME'),
      password: this.configService.get<string>('DB_PASSWORD'),
      database: this.configService.get<string>('DB_NAME'),
      ssl: this.configService.get('DB_SSL') === 'true'
        ? { rejectUnauthorized: false }
        : false,
      autoLoadEntities: true,
      synchronize: false,
      migrations: [join(__dirname, '../database/migrations/**/*{.ts,.js}')],

      // ─── Connection Pool ───────────────────────────────────────
      // Without pooling: every request opens + closes a TCP connection
      // to Supabase (50-200ms overhead per request).
      // With pooling: connections are kept alive and reused.
      //
      // extra.max        = max open connections in the pool
      // extra.min        = connections kept alive even when idle
      // extra.idleTimeoutMillis = close idle connections after 30s
      // extra.connectionTimeoutMillis = fail fast if pool exhausted
      extra: {
        max: isProd ? 20 : 5,
        min: isProd ? 5 : 1,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3000,
      },

      // Keep connections alive — prevents Supabase from closing
      // idle connections and forcing a reconnect on the next request
      keepConnectionAlive: true,

      // Only log slow queries in dev
      logging: this.configService.get('APP_ENV') === 'development'
        ? ['error', 'warn']
        : false,
    };
  }
}
