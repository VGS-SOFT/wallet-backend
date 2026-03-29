import { IsUUID, IsOptional, IsString, MaxLength } from 'class-validator';

export class EndCallDto {
  @IsUUID('4', { message: 'session_id must be a valid UUID' })
  session_id: string;

  /**
   * Optional Supabase Storage path of the recording.
   * Format: {user_id}/{session_id}.webm
   * Sent by frontend after uploading to Supabase Storage.
   * Backend stores as-is. Signed URLs generated on read.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  recording_path?: string;
}
