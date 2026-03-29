import { Injectable, Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { GoogleProfile, JwtPayload } from '../users/user.types';
import { UserEntity } from '../../database/entities/user.entity';
import { REDIS_CLIENT } from '../../config/redis.module';
import { Redis } from '@upstash/redis';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Called after Google OAuth succeeds.
   * Uses upsert-based findOrCreate — safe for concurrent requests.
   */
  async validateGoogleUser(profile: GoogleProfile): Promise<UserEntity> {
    return this.usersService.findOrCreateWithWallet(profile);
  }

  /**
   * Issues a signed JWT. Also caches session in Redis.
   */
  async generateToken(user: UserEntity): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const token = this.jwtService.sign(payload);
    // Cache session in Redis — TTL 7 days
    await this.redis.setex(`session:${user.id}`, 604800, user.email);
    return token;
  }

  /**
   * Validates JWT payload — used by JwtStrategy on every protected request.
   */
  async validateJwtPayload(payload: JwtPayload): Promise<UserEntity | null> {
    return this.usersService.findById(payload.sub);
  }

  /**
   * Logout — removes session from Redis.
   */
  async logout(userId: string): Promise<void> {
    await this.redis.del(`session:${userId}`);
  }
}
