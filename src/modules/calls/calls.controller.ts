import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallsService } from './calls.service';
import { StorageService } from '../storage/storage.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../../database/entities/user.entity';
import { EndCallDto } from './dto/end-call.dto';
import { RecordingTokenDto } from './dto/recording-token.dto';
import { TransactionQueryDto } from '../wallet/dto/transaction-query.dto';
import {
  CallSessionEntity,
  CallSessionStatus,
} from '../../database/entities/call-session.entity';

@Controller('calls')
export class CallsController {
  constructor(
    private readonly callsService: CallsService,
    private readonly storageService: StorageService,
    @InjectRepository(CallSessionEntity)
    private readonly callRepo: Repository<CallSessionEntity>,
  ) {}

  // ─── INITIATE ────────────────────────────────────────────────────────
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

  // ─── RECORDING UPLOAD TOKEN ──────────────────────────────────────────
  /**
   * Issues a pre-signed Supabase Storage upload URL.
   *
   * Security:
   *   1. JWT verified (guard runs before this)
   *   2. session_id must belong to the calling user AND be active
   *      → prevents user A getting an upload token for user B's session
   *   3. Storage path is constructed server-side: {userId}/{sessionId}.{ext}
   *      → client cannot choose an arbitrary path
   *   4. Signed URL valid for 5 minutes, single-use
   *   5. Service role key stays on backend — never sent to client
   */
  @Post('recording-token')
  @HttpCode(HttpStatus.OK)
  async getRecordingToken(
    @CurrentUser() user: UserEntity,
    @Body() dto: RecordingTokenDto,
  ) {
    // Verify session belongs to this user and is currently active
    const session = await this.callRepo.findOne({
      where: { id: dto.session_id, caller_id: user.id },
      select: ['id', 'caller_id', 'status'],
    });

    if (!session) throw new NotFoundException('Session not found.');
    if (session.status !== CallSessionStatus.ACTIVE) {
      throw new BadRequestException('Can only upload recording for an active call.');
    }
    if (session.caller_id !== user.id) {
      throw new ForbiddenException('Forbidden.');
    }

    // Path is fully server-controlled — client has no say in where it goes
    const storagePath = `${user.id}/${dto.session_id}.${dto.extension}`;
    const { signedUrl, token, path } = await this.storageService.createSignedUploadUrl(storagePath);

    return {
      signedUrl,  // PUT this URL with the audio blob
      token,      // attach as header: x-upsert or used internally by supabase-js
      path,       // send this back in /calls/end as recording_path
    };
  }

  // ─── END CALL ────────────────────────────────────────────────────────
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

  // ─── ACTIVE CALL ─────────────────────────────────────────────────────
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

  // ─── HISTORY ─────────────────────────────────────────────────────────
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

    // Generate signed read URLs in parallel — all expire in 1 hour
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
          ? await this.storageService.createSignedReadUrl(s.recording_url)
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
