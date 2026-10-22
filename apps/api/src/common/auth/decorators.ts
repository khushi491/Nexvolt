import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@nexvolt/shared';
import type { AuthUser } from './auth-user';

export const IS_PUBLIC = 'isPublic';
/** Route needs no authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
/** Route requires at least one of these roles (checked server-side on every request). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const OPTIONAL_AUTH = 'optionalAuth';
/** Public route that still resolves the user when a valid token is present. */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const MaybeUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest().user;
});

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  idempotencyKey: string | null;
}

export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest();
  const key = req.headers['idempotency-key'];
  return {
    ip: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined)?.slice(0, 300) ?? null,
    requestId: req.id ? String(req.id) : null,
    idempotencyKey: typeof key === 'string' && /^[A-Za-z0-9_\-:.]{8,100}$/.test(key) ? key : null,
  };
});
