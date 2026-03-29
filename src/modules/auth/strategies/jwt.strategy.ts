import {
  Injectable,
  UnauthorizedException,
  Logger,
  Inject,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { JwtPayload } from '../../users/user.types';
import { REDIS_CLIENT } from '../../../config/redis.module';
import { Redis } from '@upstash/redis';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  /**
   * Called automatically after JWT signature is verified.
   *
   * Two-step validation (enterprise standard):
   *  1. Verify JWT signature (done by passport-jwt before this runs)
   *  2. Cross-check Redis session — ensures logout truly invalidates tokens
   *     Without this, a logged-out token still works until JWT expiry (7 days)
   *  3. Verify user still exists in DB
   *
   * Wrapped in try/catch — Redis failure must NOT lock out all users.
   * If Redis is down, we fall back to DB-only check (graceful degradation).
   */
  async validate(payload: JwtPayload) {
    try {
      // Step 1: Cross-check Redis session
      const session = await this.redis.get(`session:${payload.sub}`);
      if (session === null) {
        // Session was deleted (logout) or Redis TTL expired
        throw new UnauthorizedException('Session expired. Please log in again.');
      }
    } catch (err) {
      // If it's our own UnauthorizedException, rethrow it
      if (err instanceof UnauthorizedException) throw err;

      // Redis is down — log the error but don't block the user
      // Graceful degradation: fall through to DB check
      this.logger.error('Redis session check failed, falling back to DB', err);
    }

    // Step 2: Verify user still exists in DB
    const user = await this.authService.validateJwtPayload(payload);
    if (!user) {
      throw new UnauthorizedException('User account no longer exists.');
    }

    return user;
  }
}
