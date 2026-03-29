import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WalletEntity } from './wallet.entity';

export enum TransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

@Entity('wallet_transactions')
export class WalletTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  wallet_id: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  /**
   * amount is always positive.
   * type (credit/debit) determines direction.
   * This prevents confusion around negative amounts.
   */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  /**
   * Balance snapshot after this transaction.
   * Stored explicitly — never recalculate balance by summing history.
   * Recalculation is slow and fragile; snapshot is O(1) and audit-safe.
   */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  balance_after: number;

  @Column({ length: 255 })
  description: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => WalletEntity, (wallet) => wallet.transactions)
  @JoinColumn({ name: 'wallet_id' })
  wallet: WalletEntity;
}
