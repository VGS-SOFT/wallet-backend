import {
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
  HttpCode,
  Post,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserEntity } from '../../database/entities/user.entity';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Step 1: Redirect user to Google consent screen.
   */
  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Passport handles redirect automatically
  }

  /**
   * Step 2: Google redirects back here.
   * Wrapped in try/catch — any failure redirects to frontend error page
   * instead of showing raw JSON 500 to the user.
   */
  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');

    try {
      if (!req.user) {
        this.logger.error('Google callback: no user in request');
        return res.redirect(`${frontendUrl}/auth/error?reason=no_user`);
      }

      const token = await this.authService.generateToken(req.user);
      return res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
    } catch (err) {
      this.logger.error('Google callback failed', err);
      return res.redirect(`${frontendUrl}/auth/error?reason=server_error`);
    }
  }

  /**
   * GET /auth/me — returns current logged-in user profile.
   */
  @Get('me')
  getMe(@CurrentUser() user: UserEntity) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
    };
  }

  /**
   * POST /auth/logout — clears Redis session.
   */
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: UserEntity) {
    await this.authService.logout(user.id);
    return { message: 'Logged out successfully' };
  }
}
