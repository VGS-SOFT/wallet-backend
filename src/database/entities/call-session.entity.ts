import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

export enum CallSessionStatus {
  ACTIVE = 'active',
  ENDED = 'ended',
  FAILED = 'failed',
  INSUFFICIENT_FUNDS = 'insufficient_funds',
}

@Entity('call_sessions')
export class CallSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  caller_id: string;

  /**
   * Rate stored at call time — immutable after creation.
   * If we change CALL_RATE_PER_MINUTE tomorrow,
   * old call records still reflect the rate that was active.
   */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  rate_per_minute: number;

  /**
   * Duration in seconds (precise).
   * Billed minutes = Math.ceil(duration_seconds / 60)
   * Storing seconds gives maximum precision for future billing models.
   */
  @Column({ type: 'int', nullable: true })
  duration_seconds: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_cost: number;

  /** Balance snapshot at call start — for audit trail */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  balance_at_start: number;

  @Column({
    type: 'enum',
    enum: CallSessionStatus,
    default: CallSessionStatus.ACTIVE,
  })
  status: CallSessionStatus;

  /**
   * Idempotency key for the debit transaction.
   * Format: `call:{session_id}`
   * Prevents double-debit if /calls/end is called twice.
   */
  @Column({ nullable: true, unique: true })
  debit_idempotency_key: string;

  @CreateDateColumn()
  started_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  ended_at: Date;

  @Column({ nullable: true, length: 255 })
  failure_reason: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'caller_id' })
  caller: UserEntity;
}
