import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConfig } from './config/database.config';
import { RedisModule } from './config/redis.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

/**
 * Root AppModule.
 * To add a new feature: import its Module here inside the imports array.
 * Example: WalletModule, AuthModule, CallModule, etc.
 */
@Module({
  imports: [
    // ─── Global Config (available everywhere) ──────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ─── Database ──────────────────────────────────
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig,
    }),

    // ─── Redis ─────────────────────────────────────
    RedisModule,

    // ─── Feature Modules (add here as we build) ────
    // AuthModule,
    // UsersModule,
    // WalletModule,
    // CallModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
