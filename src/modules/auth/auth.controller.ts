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
import { UserResponseDto } from './dto/user-response.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Step 1: Redirect to Google consent screen.
   */
  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {}

  /**
   * Step 2: Google redirects back here after user consents.
   * Fully wrapped in try/catch — any failure goes to frontend error page,
   * never a raw 500 JSON.
   */
  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');

    try {
      if (!req.user) {
        this.logger.error('Google callback: req.user is empty');
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
   * GET /auth/me — returns sanitized user profile via DTO.
   * Never exposes raw entity — DTO controls exactly what is returned.
   */
  @Get('me')
  getMe(@CurrentUser() user: UserEntity): UserResponseDto {
    return new UserResponseDto({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
    });
  }

  /**
   * POST /auth/logout — deletes Redis session.
   * Token is invalidated immediately server-side — not just cleared on frontend.
   */
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: UserEntity) {
    await this.authService.logout(user.id);
    return { message: 'Logged out successfully' };
  }
}
