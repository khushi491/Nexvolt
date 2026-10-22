import { Injectable } from '@nestjs/common';
import type { HostProfileDto, HostType } from '@nexvolt/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toHostProfileDto } from '../users/users.service';

@Injectable()
export class HostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async requireHost(user: AuthUser) {
    if (!user.hostProfileId) throw AppError.forbidden('Complete host onboarding first');
    const h = await this.prisma.hostProfile.findUniqueOrThrow({
      where: { id: user.hostProfileId },
    });
    return h;
  }

  async requireActiveHost(user: AuthUser) {
    const h = await this.requireHost(user);
    if (h.suspendedAt) throw AppError.forbidden('Your host account is suspended. Contact support.');
    return h;
  }

  async onboard(
    user: AuthUser,
    input: { displayName: string; hostType: HostType; attestationVersion: string },
  ): Promise<HostProfileDto> {
    if (user.hostProfileId)
      throw AppError.conflict('ALREADY_HOST', 'You are already registered as a host');
    const profile = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const roles = Array.from(new Set([...u.roles, 'HOST' as const]));
      await tx.user.update({ where: { id: user.id }, data: { roles } });
      const p = await tx.hostProfile.create({
        data: {
          userId: user.id,
          displayName: input.displayName,
          hostType: input.hostType,
          attestationAcceptedAt: new Date(),
          attestationVersion: input.attestationVersion,
        },
      });
      await this.audit.log(
        {
          actor: user,
          action: 'host.onboard',
          resourceType: 'HostProfile',
          resourceId: p.id,
          newValue: { hostType: p.hostType, attestationVersion: p.attestationVersion },
        },
        tx,
      );
      return p;
    });
    return toHostProfileDto(profile);
  }

  async me(user: AuthUser): Promise<HostProfileDto> {
    return toHostProfileDto(await this.requireHost(user));
  }

  async update(
    user: AuthUser,
    input: { displayName?: string; hostType?: HostType; bio?: string | null },
  ): Promise<HostProfileDto> {
    const h = await this.requireHost(user);
    return toHostProfileDto(
      await this.prisma.hostProfile.update({ where: { id: h.id }, data: input }),
    );
  }

  /**
   * Submit identity documents for MANUAL admin review. This never marks the host verified:
   * only an admin decision (audited) can set kycStatus = VERIFIED.
   */
  async submitKyc(user: AuthUser): Promise<HostProfileDto> {
    const h = await this.requireHost(user);
    if (h.kycStatus === 'VERIFIED')
      throw AppError.conflict('ALREADY_VERIFIED', 'Identity already verified');
    const doc = await this.prisma.verificationDocument.findFirst({
      where: {
        hostId: h.id,
        docType: 'IDENTITY_PROOF',
        status: { in: ['PENDING_REVIEW', 'ACCEPTED'] },
      },
    });
    if (!doc)
      throw AppError.unprocessable('DOCUMENT_REQUIRED', 'Upload an identity document first');
    const updated = await this.prisma.hostProfile.update({
      where: { id: h.id },
      data: { kycStatus: 'PENDING_REVIEW' },
    });
    await this.audit.log({
      actor: user,
      action: 'host.kyc.submit',
      resourceType: 'HostProfile',
      resourceId: h.id,
      oldValue: { kycStatus: h.kycStatus },
      newValue: { kycStatus: 'PENDING_REVIEW' },
    });
    return toHostProfileDto(updated);
  }

  /**
   * Payout onboarding. A provider-supported flow (e.g. Razorpay Route linked accounts)
   * requires a merchant account with that product enabled — not available in this MVP.
   * The request is queued for admin-managed verification; no bank details are stored here.
   */
  async requestPayoutOnboarding(user: AuthUser) {
    const h = await this.requireHost(user);
    if (h.payoutAccountStatus === 'ACTIVE')
      return {
        status: h.payoutAccountStatus,
        providerFlowAvailable: false,
        message: 'Payout account already active.',
      };
    await this.prisma.hostProfile.update({
      where: { id: h.id },
      data: { payoutAccountStatus: 'PENDING' },
    });
    return {
      status: 'PENDING' as const,
      providerFlowAvailable: false,
      message:
        'Automated payout onboarding is not yet available. Our team will contact you to verify bank details through a secure channel. Earnings remain recorded in your ledger.',
    };
  }
}
