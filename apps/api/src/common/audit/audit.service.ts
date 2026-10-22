import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import type { RequestMeta } from '../auth/decorators';
import { PrismaService, type Tx } from '../prisma/prisma.service';

export interface AuditInput {
  actor: AuthUser | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  meta?: Partial<RequestMeta>;
}

const json = (v: unknown) =>
  v === undefined
    ? undefined
    : v === null
      ? Prisma.JsonNull
      : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

/** Append-only audit log (UPDATE/DELETE blocked by a DB trigger). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput, tx?: Tx): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        actorId: input.actor?.id ?? null,
        actorRole: input.actor
          ? input.actor.isAdmin
            ? 'ADMIN'
            : input.actor.isStaff
              ? 'SUPPORT'
              : input.actor.roles.join(',')
          : 'SYSTEM',
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        reason: input.reason ?? null,
        oldValue: json(input.oldValue),
        newValue: json(input.newValue),
        ip: input.meta?.ip ?? null,
        userAgent: input.meta?.userAgent ?? null,
        requestId: input.meta?.requestId ?? null,
      },
    });
  }
}
