import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@nexvolt/shared';
import { AppError } from '../errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { isStaff, type AuthUser } from './auth-user';
import { IS_PUBLIC, OPTIONAL_AUTH, ROLES_KEY } from './decorators';

interface AccessPayload {
  sub: string;
  typ: 'access';
}

/**
 * Global guard: verifies the bearer token, then loads the user from the database on
 * every request so suspensions and role changes take effect immediately.
 * Also enforces @Roles(). Ownership checks happen in services.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH, targets);
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      if (isPublic || optional) return true;
      throw new AppError('UNAUTHENTICATED', 'Please sign in', HttpStatus.UNAUTHORIZED);
    }

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token);
      if (payload.typ !== 'access') throw new Error('wrong token type');
    } catch {
      if (isPublic && !optional) return true;
      throw new AppError(
        'UNAUTHENTICATED',
        'Your session has expired. Please sign in again.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, roles: true, status: true, hostProfile: { select: { id: true } } },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('ACCOUNT_INACTIVE', 'This account is not active', HttpStatus.UNAUTHORIZED);
    }
    const authUser: AuthUser = {
      id: user.id,
      roles: user.roles as Role[],
      hostProfileId: user.hostProfile?.id ?? null,
      isAdmin: user.roles.includes('ADMIN'),
      isStaff: isStaff({ roles: user.roles as Role[] }),
    };
    req.user = authUser;

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (required?.length && !required.some((r) => authUser.roles.includes(r))) {
      throw AppError.forbidden('Your account does not have permission for this action');
    }
    return true;
  }
}
