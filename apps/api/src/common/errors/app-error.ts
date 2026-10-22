import { HttpStatus } from '@nestjs/common';

/**
 * Domain error with a stable machine-readable code. Messages are safe to show users;
 * never put secrets or PII into them.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(what = 'Resource') {
    return new AppError('NOT_FOUND', `${what} not found`, HttpStatus.NOT_FOUND);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new AppError('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }
  static conflict(code: string, message: string, details?: unknown) {
    return new AppError(code, message, HttpStatus.CONFLICT, details);
  }
  static unprocessable(code: string, message: string, details?: unknown) {
    return new AppError(code, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
  static unavailable(code: string, message: string) {
    return new AppError(code, message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

/** Postgres exclusion_violation on the booking overlap constraint. */
export function isOverlapViolation(e: unknown): boolean {
  const s = String((e as { message?: string })?.message ?? '') + JSON.stringify((e as { meta?: unknown })?.meta ?? '');
  return s.includes('bookings_no_overlap') || s.includes('23P01');
}

export function isUniqueViolation(e: unknown, target?: string): boolean {
  const err = e as { code?: string; meta?: { target?: string[] | string }; message?: string };
  if (err?.code === 'P2002') {
    if (!target) return true;
    const t = err.meta?.target;
    return Array.isArray(t) ? t.some((x) => x.includes(target)) : String(t ?? '').includes(target);
  }
  return String(err?.message ?? '').includes('23505') && (!target || String(err?.message).includes(target));
}
