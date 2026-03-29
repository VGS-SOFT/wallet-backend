import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallsService } from './calls.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../../database/entities/user.entity';
import { EndCallDto } from './dto/end-call.dto';
import { TransactionQueryDto } from '../wallet/dto/transaction-query.dto';

@Controller('calls')
export class CallsController {
  private readonly supabaseUrl: string;
  private readonly supabaseServiceKey: string;

  constructor(
    private readonly callsService: CallsService,
    private readonly configService: ConfigService,
  ) {
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    this.supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
  }

  /**
   * Generate a signed URL for a Supabase Storage object using the REST API.
   * No supabase-js package required — pure fetch.
   * Service role key bypasses RLS so backend can sign any user's recording.
   * Signed URLs expire in 1 hour (3600 seconds).
   */
  private async createSignedUrl(storagePath: string): Promise<string | null> {
    try {
      const res = await fetch(
        `${this.supabaseUrl}/storage/v1/object/sign/call-recordings/${storagePath}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.supabaseServiceKey}`,
            apikey: this.supabaseServiceKey,
          },
          body: JSON.stringify({ expiresIn: 3600 }),
        },
      );
      if (!res.ok) return null;
      const json = await res.json() as { signedURL?: string };
      return json.signedURL
        ? `${this.supabaseUrl}/storage/v1${json.signedURL}`
        : null;
    } catch {
      return null;
    }
  }

  @Post('initiate')
  @HttpCode(HttpStatus.CREATED)
  async initiateCall(@CurrentUser() user: UserEntity) {
    const session = await this.callsService.initiateCall(user.id);
    return {
      message: 'Call started',
      session: {
        id: session.id,
        rate_per_minute: Number(session.rate_per_minute),
        balance_at_start: Number(session.balance_at_start),
        status: session.status,
        started_at: session.started_at,
      },
    };
  }

  @Post('end')
  @HttpCode(HttpStatus.OK)
  async endCall(
    @CurrentUser() user: UserEntity,
    @Body() dto: EndCallDto,
  ) {
    const session = await this.callsService.endCall(user.id, dto);
    return {
      message: 'Call ended',
      session: {
        id: session.id,
        status: session.status,
        duration_seconds: session.duration_seconds,
        rate_per_minute: Number(session.rate_per_minute),
        total_cost: Number(session.total_cost),
        started_at: session.started_at,
        ended_at: session.ended_at,
        recording_url: session.recording_url ?? null,
      },
    };
  }

  @Get('active')
  async getActiveCall(@CurrentUser() user: UserEntity) {
    const session = await this.callsService.getActiveCall(user.id);
    return {
      active: !!session,
      session: session
        ? {
            id: session.id,
            rate_per_minute: Number(session.rate_per_minute),
            balance_at_start: Number(session.balance_at_start),
            status: session.status,
            started_at: session.started_at,
          }
        : null,
    };
  }

  @Get('history')
  async getCallHistory(
    @CurrentUser() user: UserEntity,
    @Query() query: TransactionQueryDto,
  ) {
    const result = await this.callsService.getCallHistory(
      user.id,
      query.page,
      query.limit,
    );

    // Generate signed URLs for sessions with recordings — all in parallel
    const sessions = await Promise.all(
      result.sessions.map(async (s) => ({
        id: s.id,
        status: s.status,
        duration_seconds: s.duration_seconds,
        rate_per_minute: Number(s.rate_per_minute),
        total_cost: s.total_cost ? Number(s.total_cost) : null,
        balance_at_start: Number(s.balance_at_start),
        started_at: s.started_at,
        ended_at: s.ended_at,
        failure_reason: s.failure_reason,
        recording_url: s.recording_url
          ? await this.createSignedUrl(s.recording_url)
          : null,
      })),
    );

    return {
      sessions,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        total_pages: Math.ceil(result.total / result.limit),
      },
    };
  }
}
