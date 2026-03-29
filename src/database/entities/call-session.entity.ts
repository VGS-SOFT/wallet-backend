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

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  rate_per_minute: number;

  @Column({ type: 'int', nullable: true })
  duration_seconds: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_cost: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  balance_at_start: number;

  @Column({
    type: 'enum',
    enum: CallSessionStatus,
    default: CallSessionStatus.ACTIVE,
  })
  status: CallSessionStatus;

  @Column({ nullable: true, unique: true })
  debit_idempotency_key: string;

  /**
   * Supabase Storage path to the call recording.
   * Format: {user_id}/{session_id}.webm
   * Stored as the full storage path, NOT a signed URL.
   * Signed URLs are generated on-demand in the controller.
   * This keeps the stored value permanent even if signed URLs expire.
   */
  @Column({ type: 'text', nullable: true })
  recording_url: string | null;

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
