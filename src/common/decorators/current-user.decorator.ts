import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @CurrentUser() — Extracts the authenticated user from the JWT request.
 * Usage: currentUser(@CurrentUser() user: User)
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
