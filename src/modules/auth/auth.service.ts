import { Injectable, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { GoogleProfile, JwtPayload } from '../users/user.types';
import { UserEntity } from '../../database/entities/user.entity';
import { REDIS_CLIENT } from '../../config/redis.module';
import { Redis } from '@upstash/redis';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Called after Google OAuth succeeds.
   * Finds or creates the user, then issues a JWT.
   */
  async validateGoogleUser(profile: GoogleProfile): Promise<UserEntity> {
    let user = await this.usersService.findByGoogleId(profile.google_id);
    if (!user) {
      user = await this.usersService.createWithWallet(profile);
    }
    return user;
  }

  /**
   * Issues a signed JWT token for the user.
   * Also caches the user ID in Redis for fast lookup.
   */
  async generateToken(user: UserEntity): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const token = this.jwtService.sign(payload);

    // Cache user session in Redis (TTL: 7 days in seconds)
    await this.redis.setex(`session:${user.id}`, 604800, user.email);

    return token;
  }

  /**
   * Validates JWT payload — used by JwtStrategy.
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
