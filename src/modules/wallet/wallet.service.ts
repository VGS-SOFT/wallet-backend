import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { WalletEntity } from '../../database/entities/wallet.entity';
import { WalletTransactionEntity, TransactionType } from '../../database/entities/wallet-transaction.entity';
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

    private readonly dataSource: DataSource,
  ) {}

  /**
   * Get wallet by user_id.
   * Throws NotFoundException if wallet doesn't exist.
   */
  async getWalletByUserId(userId: string): Promise<WalletEntity> {
    const wallet = await this.walletRepo.findOne({ where: { user_id: userId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found for this user.');
    }
    return wallet;
  }

  /**
   * Top-up wallet balance.
   *
   * Uses PESSIMISTIC_WRITE lock inside a transaction.
   * Why: If two top-up requests hit simultaneously, without locking
   * both read balance=100, both add 500, both write 600 — one credit is lost.
   * With pessimistic lock: second request waits until first commits.
   * This guarantees correct balance under any concurrency scenario.
   */
  async topUp(userId: string, dto: TopUpDto): Promise<WalletTransactionEntity> {
    return this.dataSource.transaction(async (manager) => {
      // Lock the wallet row for this transaction
      const wallet = await manager
        .getRepository(WalletEntity)
        .findOne({
          where: { user_id: userId },
          lock: { mode: 'pessimistic_write' },
        });

      if (!wallet) {
        throw new NotFoundException('Wallet not found.');
      }

      const previousBalance = Number(wallet.balance);
      const amount = Number(dto.amount);
      const newBalance = Number((previousBalance + amount).toFixed(2));

      // Update wallet balance
      await manager.getRepository(WalletEntity).update(
        { id: wallet.id },
        { balance: newBalance },
      );

      // Record transaction
      const transaction = manager.getRepository(WalletTransactionEntity).create({
        wallet_id: wallet.id,
        type: TransactionType.CREDIT,
        amount: amount,
        balance_after: newBalance,
        description: dto.description || 'Wallet Top-Up',
      });

      return manager.getRepository(WalletTransactionEntity).save(transaction);
    });
  }

  /**
   * Debit wallet balance.
   * Used by Phase 3 (call feature) to auto-deduct call charges.
   * Exported from WalletModule so CallModule can inject WalletService.
   */
  async debit(
    userId: string,
    amount: number,
    description: string,
  ): Promise<WalletTransactionEntity> {
    return this.dataSource.transaction(async (manager) => {
      const wallet = await manager
        .getRepository(WalletEntity)
        .findOne({
          where: { user_id: userId },
          lock: { mode: 'pessimistic_write' },
        });

      if (!wallet) {
        throw new NotFoundException('Wallet not found.');
      }

      const previousBalance = Number(wallet.balance);
      const debitAmount = Number(amount);

      // Insufficient balance check
      if (previousBalance < debitAmount) {
        throw new BadRequestException(
          `Insufficient balance. Available: ₹${previousBalance.toFixed(2)}, Required: ₹${debitAmount.toFixed(2)}`,
        );
      }

      const newBalance = Number((previousBalance - debitAmount).toFixed(2));

      await manager.getRepository(WalletEntity).update(
        { id: wallet.id },
        { balance: newBalance },
      );

      const transaction = manager.getRepository(WalletTransactionEntity).create({
        wallet_id: wallet.id,
        type: TransactionType.DEBIT,
        amount: debitAmount,
        balance_after: newBalance,
        description,
      });

      return manager.getRepository(WalletTransactionEntity).save(transaction);
    });
  }

  /**
   * Get paginated transaction history for a user's wallet.
   * Ordered by created_at DESC (newest first).
   * Returns total count so frontend can render pagination.
   */
  async getTransactions(
    userId: string,
    query: TransactionQueryDto,
  ): Promise<{ transactions: WalletTransactionEntity[]; total: number; page: number; limit: number }> {
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
