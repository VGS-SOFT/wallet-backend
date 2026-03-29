import { IsUUID, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class EndCallDto {
  @IsUUID('4', { message: 'session_id must be a valid UUID' })
  session_id: string;

  /**
   * Duration in seconds sent by client.
   * Backend recalculates as cross-check:
   * actual_seconds = NOW() - started_at
   * We use MAX(client_seconds, server_seconds) to prevent
   * client sending 0 to avoid charges.
   */
  @IsInt()
  @Min(1, { message: 'Duration must be at least 1 second' })
  @Type(() => Number)
  duration_seconds: number;
}
