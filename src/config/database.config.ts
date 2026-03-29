import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { join } from 'path';

@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
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
      // Auto-loads all entities registered via TypeOrmModule.forFeature()
      autoLoadEntities: true,
      // NEVER use synchronize:true in production — use migrations
      synchronize: false,
      migrations: [join(__dirname, '../database/migrations/**/*{.ts,.js}')],
      logging: this.configService.get('APP_ENV') === 'development',
    };
  }
}
