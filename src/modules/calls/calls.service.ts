import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  CallSessionEntity,
  CallSessionStatus,
} from '../../database/entities/call-session.entity';
import { WalletService } from '../wallet/wallet.service';
import { UsersService } from '../users/users.service';
import { EndCallDto } from './dto/end-call.dto';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  /**
   * Rate and minimum balance come from environment variables.
   * Change them in .env without touching code.
   * Default: ₹2/min, minimum ₹10 to start.
   */
  private readonly ratePerMinute: number;
  private readonly minimumBalance: number;

  constructor(
    @InjectRepository(CallSessionEntity)
    private readonly callRepo: Repository<CallSessionEntity>,

    private readonly walletService: WalletService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.ratePerMinute = Number(
      this.configService.get<number>('CALL_RATE_PER_MINUTE') ?? 2,
    );
    this.minimumBalance = Number(
      this.configService.get<number>('CALL_MINIMUM_BALANCE') ?? 10,
    );
  }

  // ───────────────────────────────────────────────────────────
  // INITIATE CALL
  // Checks: no active call already running, sufficient balance
  // Creates call_session row with status = active
  // ───────────────────────────────────────────────────────────
  async initiateCall(userId: string): Promise<CallSessionEntity> {
    // Check: user doesn't already have an active call
    const existing = await this.callRepo.findOne({
      where: { caller_id: userId, status: CallSessionStatus.ACTIVE },
    });
    if (existing) {
      throw new ConflictException(
        'You already have an active call. End it before starting a new one.',
      );
    }

    // Check: sufficient balance
    const wallet = await this.walletService.getWalletByUserId(userId);
    const balance = Number(wallet.balance);

    if (balance < this.minimumBalance) {
      throw new BadRequestException(
        `Insufficient balance. Minimum ₹${this.minimumBalance} required to start a call. Current balance: ₹${balance.toFixed(2)}`,
      );
    }

    // Create call session
    const session = this.callRepo.create({
      caller_id: userId,
      rate_per_minute: this.ratePerMinute,
      balance_at_start: balance,
      status: CallSessionStatus.ACTIVE,
    });

    const saved = await this.callRepo.save(session);
    this.logger.log(`Call initiated: session=${saved.id} user=${userId} balance=₹${balance}`);
    return saved;
  }

  // ───────────────────────────────────────────────────────────
  // END CALL
  // Calculates cost, debits wallet via WalletService (double-entry),
  // updates session with duration + total_cost + status = ended
  //
  // Idempotency: debit_idempotency_key = `call:{session_id}`
  // If /end is called twice, second call returns 409 Conflict.
  // ───────────────────────────────────────────────────────────
  async endCall(userId: string, dto: EndCallDto): Promise<CallSessionEntity> {
    const session = await this.callRepo.findOne({
      where: { id: dto.session_id },
    });

    if (!session) {
      throw new NotFoundException('Call session not found.');
    }

    // Only the caller can end their own call
    if (session.caller_id !== userId) {
      throw new ForbiddenException('You can only end your own calls.');
    }

    if (session.status !== CallSessionStatus.ACTIVE) {
      throw new ConflictException(
        `Call session is already ${session.status}. Cannot end again.`,
      );
    }

    // Calculate duration
    // Server-side duration = NOW() - started_at (seconds)
    // Client sends their duration too.
    // We use MAX(client, server) to prevent client sending 0 to dodge charges.
    const serverDuration = Math.floor(
      (Date.now() - new Date(session.started_at).getTime()) / 1000,
    );
    const finalDuration = Math.max(dto.duration_seconds, serverDuration);

    // Calculate cost: CEIL(seconds / 60) * rate
    // 1 second = 1 minute billed (minimum 1 minute)
    // 61 seconds = 2 minutes billed
    const minutesBilled = Math.ceil(finalDuration / 60);
    const totalCost = Number((minutesBilled * this.ratePerMinute).toFixed(2));

    const idempotencyKey = `call:${session.id}`;

    // Debit wallet — double-entry, atomic, idempotency-protected
    try {
      await this.walletService.debit(
        userId,
        totalCost,
        `Call charge — ${minutesBilled} min @ ₹${this.ratePerMinute}/min`,
        { idempotencyKey },
      );
    } catch (err) {
      // If wallet debit fails due to insufficient funds mid-call
      if (err instanceof BadRequestException) {
        await this.callRepo.update(
          { id: session.id },
          {
            status: CallSessionStatus.INSUFFICIENT_FUNDS,
            duration_seconds: finalDuration,
            ended_at: new Date(),
            failure_reason: 'Insufficient balance at call end',
          },
        );
        throw new BadRequestException(
          'Insufficient balance to cover call charges. Call marked as unpaid.',
        );
      }
      throw err;
    }

    // Update session to ended
    await this.callRepo.update(
      { id: session.id },
      {
        status: CallSessionStatus.ENDED,
        duration_seconds: finalDuration,
        total_cost: totalCost,
        ended_at: new Date(),
        debit_idempotency_key: idempotencyKey,
      },
    );

    this.logger.log(
      `Call ended: session=${session.id} duration=${finalDuration}s billed=${minutesBilled}min cost=₹${totalCost}`,
    );

    return this.callRepo.findOne({ where: { id: session.id } });
  }

  // ───────────────────────────────────────────────────────────
  // GET ACTIVE CALL
  // Returns active call session if one exists, null otherwise.
  // Frontend polls this to show live call state.
  // ───────────────────────────────────────────────────────────
  async getActiveCall(userId: string): Promise<CallSessionEntity | null> {
    return this.callRepo.findOne({
      where: { caller_id: userId, status: CallSessionStatus.ACTIVE },
    });
  }

  // ───────────────────────────────────────────────────────────
  // CALL HISTORY
  // Paginated, newest first.
  // ───────────────────────────────────────────────────────────
  async getCallHistory(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<{ sessions: CallSessionEntity[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const [sessions, total] = await this.callRepo.findAndCount({
      where: { caller_id: userId },
      order: { started_at: 'DESC' },
      skip,
      take: limit,
    });
    return { sessions, total, page, limit };
  }
}
