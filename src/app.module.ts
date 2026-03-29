import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseConfig } from './config/database.config';
import { RedisModule } from './config/redis.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

/**
 * Root AppModule.
 * To add a new feature: import its Module here inside the imports array.
 */
@Module({
  imports: [
    // Global Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig,
    }),

    // Redis
    RedisModule,

    // Feature Modules
    UsersModule,
    AuthModule,
    // WalletModule,  <-- Phase 2
    // CallModule,    <-- Phase 3
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Register JwtAuthGuard globally — protects ALL routes
    // Use @Public() decorator to exempt specific routes
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
