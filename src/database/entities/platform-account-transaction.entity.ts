import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PlatformAccountEntity } from './platform-account.entity';
import { TransactionType } from './wallet-transaction.entity';

export enum EntryType {
  DEBIT = 'debit',
  CREDIT = 'credit',
}

@Entity('platform_account_transactions')
export class PlatformAccountTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  platform_account_id: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'enum', enum: EntryType })
  entry_type: EntryType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  balance_after: number;

  @Column({ length: 255 })
  description: string;

  @Column({ nullable: true })
  counterpart_wallet_id: string;

  @Column({ nullable: true, length: 255 })
  idempotency_key: string;

  @Column({ nullable: true, length: 255 })
  payment_reference: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => PlatformAccountEntity, (account) => account.transactions)
  @JoinColumn({ name: 'platform_account_id' })
  platformAccount: PlatformAccountEntity;
}
