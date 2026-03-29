import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PlatformAccountTransactionEntity } from './platform-account-transaction.entity';

@Entity('platform_accounts')
export class PlatformAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Human-readable unique key: 'revenue', 'escrow', 'refund_reserve'
   * Used to fetch specific accounts in code without hardcoding UUIDs.
   */
  @Column({ unique: true, length: 100 })
  slug: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0.0 })
  balance: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => PlatformAccountTransactionEntity, (tx) => tx.platformAccount)
  transactions: PlatformAccountTransactionEntity[];
}
