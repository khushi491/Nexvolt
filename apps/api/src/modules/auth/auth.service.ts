import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthResponse, OtpRequestResponse } from '@nexvolt/shared';
import { randomUUID } from 'node:crypto';
import { ENV, type Env } from '../../config/env';
import { hmacSha256Hex, randomToken, safeEqual, sha256Hex } from '../../common/crypto/crypto.service';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { OTP_PROVIDER, type OtpProvider } from './otp/otp-provider';

export const TERMS_VERSION = '2026-10-v1';
const OTP_TTL_MS = 5 * 60_000;
const RESEND_AFTER_S = 30;
const MAX_PER_PHONE_WINDOW = 5;
const MAX_PER_IP_WINDOW = 20;
const WINDOW_MS = 15 * 60_000;
const MAX_VERIFY_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    @Inject(OTP_PROVIDER) private readonly otp: OtpProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async requestOtp(phone: string, ip: string | null): Promise<OtpRequestResponse> {
    const since = new Date(Date.now() - WINDOW_MS);
    const [byPhone, byIp, latest] = await Promise.all([
      this.prisma.otpChallenge.count({ where: { phone, createdAt: { gte: since } } }),
      ip ? this.prisma.otpChallenge.count({ where: { ip, createdAt: { gte: since } } }) : Promise.resolve(0),
      this.prisma.otpChallenge.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } }),
    ]);
    if (latest && Date.now() - latest.createdAt.getTime() < RESEND_AFTER_S * 1000) {
      throw new AppError('OTP_COOLDOWN', `Please wait ${RESEND_AFTER_S} seconds before requesting another code`, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (byPhone >= MAX_PER_PHONE_WINDOW || byIp >= MAX_PER_IP_WINDOW) {
      throw new AppError('OTP_RATE_LIMITED', 'Too many code requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const id = randomUUID();
    const sent = await this.otp.send(phone);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await this.prisma.otpChallenge.create({
      data: {
        id,
        phone,
        provider: this.otp.name,
        providerRef: sent.providerRef,
        codeHash: sent.code ? this.hashCode(id, sent.code) : null,
        expiresAt,
        ip,
      },
    });
    return { expiresAt: expiresAt.toISOString(), resendAfterSeconds: RESEND_AFTER_S, deliveryChannel: sent.channel };
  }

  private hashCode(challengeId: string, code: string): string {
    return hmacSha256Hex(this.env.OTP_HMAC_SECRET, `${challengeId}:${code}`);
  }

  async verifyOtp(
    input: { phone: string; code: string; acceptTerms?: boolean; termsVersion?: string },
    meta: { ip: string | null; userAgent: string | null },
  ): Promise<AuthResponse> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone: input.phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    const invalid = new AppError('OTP_INVALID', 'That code is incorrect or has expired', HttpStatus.UNAUTHORIZED);
    if (!challenge) throw invalid;
    if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw new AppError('OTP_LOCKED', 'Too many incorrect attempts. Request a new code.', HttpStatus.TOO_MANY_REQUESTS);
    }
    // Count the attempt before checking so parallel guesses cannot bypass the limit.
    const bumped = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, attempts: { lt: MAX_VERIFY_ATTEMPTS }, consumedAt: null },
      data: { attempts: { increment: 1 } },
    });
    if (bumped.count === 0) throw invalid;

    let ok: boolean;
    if (challenge.codeHash) ok = safeEqual(challenge.codeHash, this.hashCode(challenge.id, input.code));
    else if (this.otp.check) ok = await this.otp.check(input.phone, input.code, challenge.providerRef);
    else ok = false;
    if (!ok) throw invalid;

    // New users must consent before an account is created. Check this BEFORE consuming the
    // code so the user can tick the box and resubmit the same code (no resend / cooldown).
    const consentGiven = input.acceptTerms === true && input.termsVersion === TERMS_VERSION;
    const existing = await this.prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } });
    if (!existing && !consentGiven) {
      throw new AppError('CONSENT_REQUIRED', 'Please accept the Terms and Privacy Notice to continue', HttpStatus.UNPROCESSABLE_ENTITY, { termsVersion: TERMS_VERSION });
    }

    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) throw invalid;

    let user = await this.prisma.user.findUnique({ where: { phone: input.phone } });
    if (user && user.status !== 'ACTIVE') {
      throw new AppError('ACCOUNT_INACTIVE', 'This account is not active. Contact support.', HttpStatus.FORBIDDEN);
    }
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone: input.phone,
          roles: ['DRIVER'],
          consentAcceptedAt: new Date(),
          consentVersion: TERMS_VERSION,
          driverProfile: { create: {} },
        },
      });
    } else if (consentGiven && user.consentVersion !== TERMS_VERSION) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { consentAcceptedAt: new Date(), consentVersion: TERMS_VERSION } });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueTokens(user.id, randomUUID(), meta);
  }

  private async issueTokens(userId: string, familyId: string, meta: { ip: string | null; userAgent: string | null }): Promise<AuthResponse> {
    const ttl = this.env.JWT_ACCESS_TTL_SECONDS;
    const accessToken = await this.jwt.signAsync({ sub: userId, typ: 'access' }, { expiresIn: ttl });
    const refreshToken = randomToken(48);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256Hex(refreshToken),
        expiresAt: new Date(Date.now() + this.env.REFRESH_TTL_DAYS * 86_400_000),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return {
      accessToken,
      accessTokenExpiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      refreshToken,
      user: await this.users.getMe(userId),
    };
  }

  /** Rotating refresh tokens with reuse detection. */
  async refresh(refreshToken: string, meta: { ip: string | null; userAgent: string | null }): Promise<AuthResponse> {
    const tokenHash = sha256Hex(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
    const unauthorized = new AppError('UNAUTHENTICATED', 'Your session has expired. Please sign in again.', HttpStatus.UNAUTHORIZED);
    if (!existing) throw unauthorized;
    if (existing.revokedAt) {
      // Reuse of a rotated token: assume theft and revoke the whole family.
      await this.prisma.refreshToken.updateMany({ where: { familyId: existing.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw unauthorized;
    }
    if (existing.expiresAt < new Date() || existing.user.status !== 'ACTIVE') throw unauthorized;
    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (rotated.count === 0) throw unauthorized;
    return this.issueTokens(existing.userId, existing.familyId, meta);
  }

  async logout(refreshToken: string): Promise<void> {
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256Hex(refreshToken) } });
    if (existing) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: existing.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
  }
}
