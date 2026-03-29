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

export enum AccountType {
  USER_WALLET = 'user_wallet',
  PLATFORM_ACCOUNT = 'platform_account',
}

export enum EntryType {
  DEBIT = 'debit',
  CREDIT = 'credit',
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
   * entry_type: the double-entry direction FOR THIS SPECIFIC ROW.
   * Top-up (money arrives in wallet)     -> entry_type = CREDIT
   * Call charge (money leaves wallet)    -> entry_type = DEBIT
   */
  @Column({ type: 'enum', enum: EntryType, default: EntryType.DEBIT })
  entry_type: EntryType;

  @Column({ type: 'enum', enum: AccountType, default: AccountType.USER_WALLET })
  account_type: AccountType;

  /** ID of the platform_account that received/sent the counterpart entry */
  @Column({ nullable: true })
  counterpart_account_id: string;

  @Column({ type: 'enum', enum: AccountType, nullable: true })
  counterpart_account_type: AccountType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  balance_after: number;

  @Column({ length: 255 })
  description: string;

  /**
   * Idempotency key: database-level guarantee against double-processing.
   * Format: `topup:{topup_order_id}` or `call:{call_session_id}:{minute}`
   * Unique index in DB ensures even concurrent requests can't duplicate.
   */
  @Column({ nullable: true, length: 255, unique: true })
  idempotency_key: string;

  /** Razorpay payment_id or any external payment reference */
  @Column({ nullable: true, length: 255 })
  payment_reference: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => WalletEntity, (wallet) => wallet.transactions)
  @JoinColumn({ name: 'wallet_id' })
  wallet: WalletEntity;
}
