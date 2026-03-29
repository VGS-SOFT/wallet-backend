import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  /**
   * Called by Passport after Google returns the user profile.
   * MUST use try/catch — any unhandled throw here becomes a raw 500.
   * Instead we pass errors to done(err) so Passport handles them cleanly.
   */
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    try {
      const googleProfile = {
        google_id: profile.id,
        email: profile.emails?.[0]?.value,
        name: profile.displayName,
        avatar_url: profile.photos?.[0]?.value || null,
      };

      if (!googleProfile.email) {
        return done(new Error('No email returned from Google'), null);
      }

      const user = await this.authService.validateGoogleUser(googleProfile);
      return done(null, user);
    } catch (err) {
      this.logger.error('Google OAuth validation failed', err);
      return done(err, null);
    }
  }
}
