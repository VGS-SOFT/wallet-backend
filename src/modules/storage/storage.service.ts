import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: SupabaseClient;
  private readonly bucket = 'call-recordings';

  constructor(private readonly config: ConfigService) {
    // Service role key — never exposed to frontend.
    // Bypasses RLS. Only used server-side.
    this.client = createClient(
      this.config.get<string>('SUPABASE_URL'),
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          // Disable auto session management — this is a server client
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  /**
   * Issue a pre-signed UPLOAD URL for a specific storage path.
   *
   * Security guarantees:
   *   - Path is constructed server-side from verified userId + sessionId
   *   - Client receives a URL valid for 5 minutes only
   *   - URL is single-use (Supabase enforces this)
   *   - Service role key never leaves the backend
   *   - Frontend uploads directly to Supabase — audio never hits NestJS
   *
   * @param storagePath  e.g. "userId/sessionId.webm"
   * @returns { signedUrl, token, path }
   */
  async createSignedUploadUrl(
    storagePath: string,
  ): Promise<{ signedUrl: string; token: string; path: string }> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      this.logger.error(`Failed to create signed upload URL: ${error?.message}`);
      throw new InternalServerErrorException('Could not generate upload URL. Try again.');
    }

    return {
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
    };
  }

  /**
   * Generate a signed READ URL for playback.
   * Called when serving call history — 1 hour expiry.
   *
   * @param storagePath  e.g. "userId/sessionId.webm"
   */
  async createSignedReadUrl(storagePath: string): Promise<string | null> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(storagePath, 3600); // 1 hour

    if (error || !data?.signedUrl) {
      this.logger.warn(`Could not generate read URL for ${storagePath}: ${error?.message}`);
      return null;
    }

    return data.signedUrl;
  }
}
