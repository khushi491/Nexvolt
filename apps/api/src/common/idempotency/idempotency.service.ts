import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { sha256Hex } from '../crypto/crypto.service';
import { AppError, isUniqueViolation } from '../errors/app-error';
import { PrismaService } from '../prisma/prisma.service';

const TTL_HOURS = 24;

/**
 * Idempotency-Key handling for mutating endpoints (create booking, payment
 * operations, session completion, refunds). A repeated request with the same key
 * and body returns the stored response; the same key with a different body is rejected.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    scope: string,
    userId: string,
    key: string | null,
    body: unknown,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!key) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'An Idempotency-Key header (8–100 chars) is required for this request',
        HttpStatus.BAD_REQUEST,
      );
    }
    const requestHash = sha256Hex(JSON.stringify(body ?? null));
    let recordId: string;
    try {
      const rec = await this.prisma.idempotencyRecord.create({
        data: {
          scope,
          userId,
          key,
          requestHash,
          expiresAt: new Date(Date.now() + TTL_HOURS * 3600_000),
        },
      });
      recordId = rec.id;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { scope_userId_key: { scope, userId, key } },
      });
      if (!existing) throw e;
      if (existing.requestHash !== requestHash) {
        throw AppError.unprocessable(
          'IDEMPOTENCY_KEY_REUSED',
          'This Idempotency-Key was already used with a different request',
        );
      }
      if (existing.responseStatus == null) {
        throw AppError.conflict(
          'IDEMPOTENCY_IN_PROGRESS',
          'The original request is still being processed. Retry shortly.',
        );
      }
      return existing.responseBody as T;
    }
    try {
      const result = await fn();
      await this.prisma.idempotencyRecord.update({
        where: { id: recordId },
        data: {
          responseStatus: 200,
          responseBody: JSON.parse(JSON.stringify(result ?? null)) as Prisma.InputJsonValue,
        },
      });
      return result;
    } catch (e) {
      // Allow a clean retry after failures.
      await this.prisma.idempotencyRecord
        .delete({ where: { id: recordId } })
        .catch(() => undefined);
      throw e;
    }
  }

  async purgeExpired(): Promise<number> {
    const r = await this.prisma.idempotencyRecord.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return r.count;
  }
}
