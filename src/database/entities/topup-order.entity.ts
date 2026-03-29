import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { WalletEntity } from './wallet.entity';

export enum TopUpOrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum PaymentGateway {
  MANUAL = 'manual',
  RAZORPAY = 'razorpay',
}

@Entity('topup_orders')
export class TopUpOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @Column()
  wallet_id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ type: 'enum', enum: TopUpOrderStatus, default: TopUpOrderStatus.PENDING })
  status: TopUpOrderStatus;

  @Column({ type: 'enum', enum: PaymentGateway, default: PaymentGateway.MANUAL })
  gateway: PaymentGateway;

  @Column({ nullable: true, length: 255 })
  gateway_order_id: string;

  @Column({ nullable: true, length: 255 })
  gateway_payment_id: string;

  @Column({ nullable: true, length: 500 })
  gateway_signature: string;

  @Column({ nullable: true, length: 255 })
  failure_reason: string;

  @Column({ nullable: true, type: 'timestamptz' })
  paid_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @ManyToOne(() => WalletEntity)
  @JoinColumn({ name: 'wallet_id' })
  wallet: WalletEntity;
}
