import {
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
  HttpCode,
  Post,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserEntity } from '../../database/entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Step 1: Redirect user to Google consent screen.
   * Public route — no JWT needed.
   */
  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Passport handles the redirect automatically
  }

  /**
   * Step 2: Google redirects back here after consent.
   * Passport validates, AuthService finds/creates user,
   * JWT is issued and sent back to frontend via redirect.
   */
  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const token = await this.authService.generateToken(req.user);
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    // Redirect to frontend with token as query param
    // Frontend stores it and removes from URL
    return res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }

  /**
   * GET /auth/me — returns current logged-in user profile.
   * Protected by global JwtAuthGuard.
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
   * Protected by global JwtAuthGuard.
   */
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: UserEntity) {
    await this.authService.logout(user.id);
    return { message: 'Logged out successfully' };
  }
}
