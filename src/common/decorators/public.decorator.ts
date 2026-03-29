import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() — Mark any route as public (skip JWT guard).
 * Usage: Add @Public() above any controller method.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
