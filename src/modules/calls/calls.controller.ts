import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { CallsService } from './calls.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../../database/entities/user.entity';
import { EndCallDto } from './dto/end-call.dto';
import { TransactionQueryDto } from '../wallet/dto/transaction-query.dto';

@Controller('calls')
export class CallsController {
  // Supabase admin client — used to generate signed URLs for recordings
  // Service role key bypasses RLS so the backend can read any user's recording
  private readonly supabase;

  constructor(
    private readonly callsService: CallsService,
    private readonly configService: ConfigService,
  ) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
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

    // Generate signed URLs for any sessions that have recordings
    // Signed URLs expire in 1 hour — frontend can play but not hotlink permanently
    const sessions = await Promise.all(
      result.sessions.map(async (s) => {
        let signedRecordingUrl: string | null = null;

        if (s.recording_url) {
          const { data } = await this.supabase.storage
            .from('call-recordings')
            .createSignedUrl(s.recording_url, 3600); // 1 hour expiry
          signedRecordingUrl = data?.signedUrl ?? null;
        }

        return {
          id: s.id,
          status: s.status,
          duration_seconds: s.duration_seconds,
          rate_per_minute: Number(s.rate_per_minute),
          total_cost: s.total_cost ? Number(s.total_cost) : null,
          balance_at_start: Number(s.balance_at_start),
          started_at: s.started_at,
          ended_at: s.ended_at,
          failure_reason: s.failure_reason,
          recording_url: signedRecordingUrl,
        };
      }),
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
