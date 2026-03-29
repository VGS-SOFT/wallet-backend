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

  // ─── INITIATE CALL ────────────────────────────────────────────────
  async initiateCall(userId: string): Promise<CallSessionEntity> {
    const [existing, wallet] = await Promise.all([
      this.callRepo.findOne({
        where: { caller_id: userId, status: CallSessionStatus.ACTIVE },
        select: ['id'],
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

  // ─── END CALL ───────────────────────────────────────────────────
  // Billing: MAX(duration, 60) / 60 * rate  (exact per-second after 1 min)
  // Recording: optional storage path saved if provided
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

    const endedAt = new Date();
    const durationSeconds = Math.floor(
      (endedAt.getTime() - new Date(session.started_at).getTime()) / 1000,
    );

    const billableSeconds = Math.max(durationSeconds, 60);
    const totalCost = Number(
      ((billableSeconds / 60) * this.ratePerMinute).toFixed(2),
    );

    const idempotencyKey = `call:${session.id}`;

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
        throw new BadRequestException('Insufficient balance to cover call charges.');
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
        // Store recording path if provided — null if user denied mic
        recording_url: dto.recording_path ?? null,
      },
    );

    this.logger.log(
      `Call ended: session=${session.id} duration=${durationSeconds}s cost=₹${totalCost} recording=${dto.recording_path ?? 'none'}`,
    );

    return this.callRepo.findOne({ where: { id: session.id } });
  }

  // ─── GET ACTIVE CALL ───────────────────────────────────────────────
  async getActiveCall(userId: string): Promise<CallSessionEntity | null> {
    return this.callRepo.findOne({
      where: { caller_id: userId, status: CallSessionStatus.ACTIVE },
      select: ['id', 'rate_per_minute', 'balance_at_start', 'status', 'started_at'],
    });
  }

  // ─── CALL HISTORY ─────────────────────────────────────────────────
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
        'ended_at', 'failure_reason', 'recording_url',
      ],
    });
    return { sessions, total, page, limit };
  }
}
