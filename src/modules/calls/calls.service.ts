import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  private readonly ratePerMinute: number;
  private readonly minimumBalance: number;

  constructor(
    @InjectRepository(CallSessionEntity)
    private readonly callRepo: Repository<CallSessionEntity>,
    private readonly walletService: WalletService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
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
  // Runs active-call check and balance check in parallel.
  // Both are read-only, no reason to run them sequentially.
  // ───────────────────────────────────────────────────────────
  async initiateCall(userId: string): Promise<CallSessionEntity> {
    // Parallel: check existing call AND fetch wallet at the same time
    // Sequential = 2 DB round trips. Parallel = 1 round trip (both fire together).
    const [existing, wallet] = await Promise.all([
      this.callRepo.findOne({
        where: { caller_id: userId, status: CallSessionStatus.ACTIVE },
        select: ['id'],  // only need to know it exists, not full row
      }),
      this.walletService.getWalletByUserId(userId),
    ]);

    if (existing) {
      throw new ConflictException(
        'You already have an active call. End it before starting a new one.',
      );
    }

    const balance = Number(wallet.balance);
    if (balance < this.minimumBalance) {
      throw new BadRequestException(
        `Insufficient balance. Minimum ₹${this.minimumBalance} required. Current: ₹${balance.toFixed(2)}`,
      );
    }

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
  //
  // BILLING FORMULA (exact second billing):
  //   duration  = server NOW() - started_at  (pure server, no client input)
  //   cost      = MAX(duration, 60) / 60 * rate_per_minute
  //
  // Examples:
  //   30s  → MAX(30,60)/60  * 2 = ₹2.00  (minimum 1 min charge)
  //   60s  → MAX(60,60)/60  * 2 = ₹2.00
  //   61s  → MAX(61,60)/60  * 2 = ₹2.03  (exact — NOT rounded to 2 min)
  //   90s  → MAX(90,60)/60  * 2 = ₹3.00
  //   120s → MAX(120,60)/60 * 2 = ₹4.00
  //
  // No more CEIL(seconds/60) — that was the bug causing 61s = ₹4.
  // ───────────────────────────────────────────────────────────
  async endCall(userId: string, dto: EndCallDto): Promise<CallSessionEntity> {
    const session = await this.callRepo.findOne({
      where: { id: dto.session_id },
    });

    if (!session) throw new NotFoundException('Call session not found.');
    if (session.caller_id !== userId) throw new ForbiddenException('You can only end your own calls.');
    if (session.status !== CallSessionStatus.ACTIVE) {
      throw new ConflictException(`Call already ${session.status}.`);
    }

    // Server-only duration — no client value used at all
    const endedAt = new Date();
    const durationSeconds = Math.floor(
      (endedAt.getTime() - new Date(session.started_at).getTime()) / 1000,
    );

    // ── Exact billing formula ──
    // Minimum charge: 60 seconds worth (₹2 at default rate)
    // After 60s: billed per exact second
    const billableSeconds = Math.max(durationSeconds, 60);
    const totalCost = Number(
      ((billableSeconds / 60) * this.ratePerMinute).toFixed(2),
    );

    const idempotencyKey = `call:${session.id}`;

    // Debit wallet — double-entry, atomic, idempotency-protected
    try {
      await this.walletService.debit(
        userId,
        totalCost,
        `Call charge — ${durationSeconds}s @ ₹${this.ratePerMinute}/min`,
        { idempotencyKey },
      );
    } catch (err) {
      if (err instanceof BadRequestException) {
        await this.callRepo.update(
          { id: session.id },
          {
            status: CallSessionStatus.INSUFFICIENT_FUNDS,
            duration_seconds: durationSeconds,
            ended_at: endedAt,
            failure_reason: 'Insufficient balance at call end',
          },
        );
        throw new BadRequestException(
          'Insufficient balance to cover call charges.',
        );
      }
      throw err;
    }

    await this.callRepo.update(
      { id: session.id },
      {
        status: CallSessionStatus.ENDED,
        duration_seconds: durationSeconds,
        total_cost: totalCost,
        ended_at: endedAt,
        debit_idempotency_key: idempotencyKey,
      },
    );

    this.logger.log(
      `Call ended: session=${session.id} duration=${durationSeconds}s cost=₹${totalCost}`,
    );

    return this.callRepo.findOne({ where: { id: session.id } });
  }

  // ───────────────────────────────────────────────────────────
  // GET ACTIVE CALL — select only needed columns
  // ───────────────────────────────────────────────────────────
  async getActiveCall(userId: string): Promise<CallSessionEntity | null> {
    return this.callRepo.findOne({
      where: { caller_id: userId, status: CallSessionStatus.ACTIVE },
      select: ['id', 'rate_per_minute', 'balance_at_start', 'status', 'started_at'],
    });
  }

  // ───────────────────────────────────────────────────────────
  // CALL HISTORY — select only columns needed for list view
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
      select: [
        'id', 'status', 'duration_seconds', 'total_cost',
        'rate_per_minute', 'balance_at_start', 'started_at',
        'ended_at', 'failure_reason',
      ],
    });
    return { sessions, total, page, limit };
  }
}
