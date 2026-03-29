import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * @Global — RedisModule is available in every module without re-importing.
 * Inject Redis client anywhere using: @Inject(REDIS_CLIENT) private redis: Redis
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Redis({
          url: config.get<string>('UPSTASH_REDIS_REST_URL'),
          token: config.get<string>('UPSTASH_REDIS_REST_TOKEN'),
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
