import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryFailedError } from 'typeorm';
import { WalletEntity } from '../../database/entities/wallet.entity';
import {
  WalletTransactionEntity,
  TransactionType,
  EntryType,
  AccountType,
} from '../../database/entities/wallet-transaction.entity';
import { PlatformAccountEntity } from '../../database/entities/platform-account.entity';
import {
  PlatformAccountTransactionEntity,
  EntryType as PlatformEntryType,
} from '../../database/entities/platform-account-transaction.entity';
import {
  TopUpOrderEntity,
  TopUpOrderStatus,
  PaymentGateway,
} from '../../database/entities/topup-order.entity';
import { TopUpDto } from './dto/topup.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,

    @InjectRepository(WalletTransactionEntity)
    private readonly txRepo: Repository<WalletTransactionEntity>,

    @InjectRepository(PlatformAccountEntity)
    private readonly platformAccountRepo: Repository<PlatformAccountEntity>,

    @InjectRepository(PlatformAccountTransactionEntity)
    private readonly platformTxRepo: Repository<PlatformAccountTransactionEntity>,

    @InjectRepository(TopUpOrderEntity)
    private readonly topUpOrderRepo: Repository<TopUpOrderEntity>,

    private readonly dataSource: DataSource,
  ) {}

  // ─────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────

  private async getWalletLocked(userId: string, manager: any): Promise<WalletEntity> {
    const wallet = await manager.getRepository(WalletEntity).findOne({
      where: { user_id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) throw new NotFoundException('Wallet not found.');
    return wallet;
  }

  private async getPlatformAccountLocked(slug: string, manager: any): Promise<PlatformAccountEntity> {
    const account = await manager.getRepository(PlatformAccountEntity).findOne({
      where: { slug },
      lock: { mode: 'pessimistic_write' },
    });
    if (!account) throw new NotFoundException(`Platform account '${slug}' not found.`);
    return account;
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC: GET BALANCE
  // ─────────────────────────────────────────────────────────

  async getWalletByUserId(userId: string): Promise<WalletEntity> {
    const wallet = await this.walletRepo.findOne({ where: { user_id: userId } });
    if (!wallet) throw new NotFoundException('Wallet not found for this user.');
    return wallet;
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC: TOP-UP (MANUAL — no payment gateway yet)
  //
  // Double-entry flow:
  //   DEBIT  Escrow Account      (money arrived from outside)
  //   CREDIT User Wallet         (money credited to user)
  //
  // When Razorpay is integrated, this same method is called
  // from the webhook handler AFTER payment is confirmed.
  // The topup_order_id becomes the idempotency_key.
  // ─────────────────────────────────────────────────────────

  async topUp(
    userId: string,
    dto: TopUpDto,
    options?: { idempotencyKey?: string; paymentReference?: string; gateway?: PaymentGateway },
  ): Promise<WalletTransactionEntity> {
    return this.dataSource.transaction(async (manager) => {
      // Lock both accounts atomically
      const [wallet, escrowAccount] = await Promise.all([
        this.getWalletLocked(userId, manager),
        this.getPlatformAccountLocked('escrow', manager),
      ]);

      const amount = Number(Number(dto.amount).toFixed(2));
      const newWalletBalance = Number((Number(wallet.balance) + amount).toFixed(2));
      const newEscrowBalance = Number((Number(escrowAccount.balance) + amount).toFixed(2));

      // Update user wallet balance
      await manager.getRepository(WalletEntity).update(
        { id: wallet.id },
        { balance: newWalletBalance },
      );

      // Update escrow account balance
      await manager.getRepository(PlatformAccountEntity).update(
        { id: escrowAccount.id },
        { balance: newEscrowBalance },
      );

      // ── Entry 1: User wallet CREDIT (money arrived) ──
      const walletTx = manager.getRepository(WalletTransactionEntity).create({
        wallet_id: wallet.id,
        type: TransactionType.CREDIT,
        entry_type: EntryType.CREDIT,
        account_type: AccountType.USER_WALLET,
        counterpart_account_id: escrowAccount.id,
        counterpart_account_type: AccountType.PLATFORM_ACCOUNT,
        amount,
        balance_after: newWalletBalance,
        description: dto.description || 'Wallet Top-Up',
        idempotency_key: options?.idempotencyKey ?? null,
        payment_reference: options?.paymentReference ?? null,
      });

      // ── Entry 2: Escrow account DEBIT (money went to user) ──
      const platformTx = manager.getRepository(PlatformAccountTransactionEntity).create({
        platform_account_id: escrowAccount.id,
        type: TransactionType.CREDIT,
        entry_type: PlatformEntryType.DEBIT,
        amount,
        balance_after: newEscrowBalance,
        description: `Top-up credited to user wallet`,
        counterpart_wallet_id: wallet.id,
        idempotency_key: options?.idempotencyKey ?? null,
        payment_reference: options?.paymentReference ?? null,
      });

      // Both entries written atomically — if either fails, both roll back
      const [savedWalletTx] = await Promise.all([
        manager.getRepository(WalletTransactionEntity).save(walletTx),
        manager.getRepository(PlatformAccountTransactionEntity).save(platformTx),
      ]);

      return savedWalletTx;
    }).catch((err) => {
      // Idempotency key violation — same request fired twice
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        throw new ConflictException(
          'This transaction has already been processed. (Duplicate idempotency key)',
        );
      }
      throw err;
    });
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC: DEBIT (used by Phase 3 — call charges)
  //
  // Double-entry flow:
  //   DEBIT  User Wallet          (money leaves user)
  //   CREDIT Platform Revenue     (money arrives at platform)
  // ─────────────────────────────────────────────────────────

  async debit(
    userId: string,
    amount: number,
    description: string,
    options?: { idempotencyKey?: string },
  ): Promise<WalletTransactionEntity> {
    return this.dataSource.transaction(async (manager) => {
      const [wallet, revenueAccount] = await Promise.all([
        this.getWalletLocked(userId, manager),
        this.getPlatformAccountLocked('revenue', manager),
      ]);

      const debitAmount = Number(Number(amount).toFixed(2));
      const currentBalance = Number(wallet.balance);

      if (currentBalance < debitAmount) {
        throw new BadRequestException(
          `Insufficient balance. Available: ₹${currentBalance.toFixed(2)}, Required: ₹${debitAmount.toFixed(2)}`,
        );
      }

      const newWalletBalance = Number((currentBalance - debitAmount).toFixed(2));
      const newRevenueBalance = Number((Number(revenueAccount.balance) + debitAmount).toFixed(2));

      await manager.getRepository(WalletEntity).update(
        { id: wallet.id },
        { balance: newWalletBalance },
      );

      await manager.getRepository(PlatformAccountEntity).update(
        { id: revenueAccount.id },
        { balance: newRevenueBalance },
      );

      // ── Entry 1: User wallet DEBIT ──
      const walletTx = manager.getRepository(WalletTransactionEntity).create({
        wallet_id: wallet.id,
        type: TransactionType.DEBIT,
        entry_type: EntryType.DEBIT,
        account_type: AccountType.USER_WALLET,
        counterpart_account_id: revenueAccount.id,
        counterpart_account_type: AccountType.PLATFORM_ACCOUNT,
        amount: debitAmount,
        balance_after: newWalletBalance,
        description,
        idempotency_key: options?.idempotencyKey ?? null,
      });

      // ── Entry 2: Revenue account CREDIT ──
      const platformTx = manager.getRepository(PlatformAccountTransactionEntity).create({
        platform_account_id: revenueAccount.id,
        type: TransactionType.CREDIT,
        entry_type: PlatformEntryType.CREDIT,
        amount: debitAmount,
        balance_after: newRevenueBalance,
        description: `Call charge from user`,
        counterpart_wallet_id: wallet.id,
        idempotency_key: options?.idempotencyKey ?? null,
      });

      const [savedWalletTx] = await Promise.all([
        manager.getRepository(WalletTransactionEntity).save(walletTx),
        manager.getRepository(PlatformAccountTransactionEntity).save(platformTx),
      ]);

      return savedWalletTx;
    }).catch((err) => {
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        throw new ConflictException('Duplicate transaction. Already processed.');
      }
      throw err;
    });
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC: PAGINATED TRANSACTION HISTORY
  // ─────────────────────────────────────────────────────────

  async getTransactions(
    userId: string,
    query: TransactionQueryDto,
  ): Promise<{
    transactions: WalletTransactionEntity[];
    total: number;
    page: number;
    limit: number;
  }> {
    const wallet = await this.getWalletByUserId(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [transactions, total] = await this.txRepo.findAndCount({
      where: { wallet_id: wallet.id },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return { transactions, total, page, limit };
  }
}
