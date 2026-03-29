import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { WalletTransactionEntity } from './wallet-transaction.entity';

@Entity('wallets')
export class WalletEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  user_id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.0 })
  balance: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => UserEntity, (user) => user.wallet)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @OneToMany(() => WalletTransactionEntity, (tx) => tx.wallet)
  transactions: WalletTransactionEntity[];
}
