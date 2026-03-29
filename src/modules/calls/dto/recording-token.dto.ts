import { IsUUID, IsIn } from 'class-validator';

const ALLOWED_EXTENSIONS = ['webm', 'ogg', 'm4a'] as const;
export type AudioExtension = (typeof ALLOWED_EXTENSIONS)[number];

export class RecordingTokenDto {
  @IsUUID('4', { message: 'session_id must be a valid UUID' })
  session_id: string;

  /**
   * Audio container format the browser will record in.
   * Allowed: webm, ogg, m4a
   * Validated server-side — prevents path traversal or unexpected file types.
   */
  @IsIn(ALLOWED_EXTENSIONS, {
    message: `extension must be one of: ${ALLOWED_EXTENSIONS.join(', ')}`,
  })
  extension: AudioExtension;
}
