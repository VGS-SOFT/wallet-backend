import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CallsService } from './calls.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../../database/entities/user.entity';
import { EndCallDto } from './dto/end-call.dto';
import { TransactionQueryDto } from '../wallet/dto/transaction-query.dto';

@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  /**
   * POST /calls/initiate
   * Starts a new call session.
   * Checks: no existing active call, balance >= minimum.
   */
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

  /**
   * POST /calls/end
   * Ends an active call, calculates cost, debits wallet.
   */
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
        minutes_billed: Math.ceil(session.duration_seconds / 60),
        rate_per_minute: Number(session.rate_per_minute),
        total_cost: Number(session.total_cost),
        started_at: session.started_at,
        ended_at: session.ended_at,
      },
    };
  }

  /**
   * GET /calls/active
   * Returns current active call if one exists.
   * Frontend uses this to restore call UI on page refresh.
   */
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

  /**
   * GET /calls/history
   * Paginated call history for the logged-in user.
   */
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
    return {
      sessions: result.sessions.map((s) => ({
        id: s.id,
        status: s.status,
        duration_seconds: s.duration_seconds,
        minutes_billed: s.duration_seconds
          ? Math.ceil(s.duration_seconds / 60)
          : null,
        rate_per_minute: Number(s.rate_per_minute),
        total_cost: s.total_cost ? Number(s.total_cost) : null,
        balance_at_start: Number(s.balance_at_start),
        started_at: s.started_at,
        ended_at: s.ended_at,
        failure_reason: s.failure_reason,
      })),
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        total_pages: Math.ceil(result.total / result.limit),
      },
    };
  }
}
