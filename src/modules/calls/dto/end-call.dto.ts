import { IsUUID } from 'class-validator';

export class EndCallDto {
  @IsUUID('4', { message: 'session_id must be a valid UUID' })
  session_id: string;

  // Duration is now calculated purely server-side.
  // started_at is stored in DB at call creation.
  // ended_at = NOW() at call end.
  // duration = ended_at - started_at  — no client input needed.
  // This eliminates the 1-2 second drift from network latency.
}
