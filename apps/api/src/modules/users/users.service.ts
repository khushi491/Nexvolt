import { Injectable } from '@nestjs/common';
import {
  DEFAULT_NOTIFICATION_PREFS,
  type HostProfileDto,
  type NotificationPrefs,
  type Role,
  type UserDto,
} from '@nexvolt/shared';
import type { HostProfile, Prisma } from '@prisma/client';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';

export function toHostProfileDto(h: HostProfile): HostProfileDto {
  return {
    id: h.id,
    userId: h.userId,
    displayName: h.displayName,
    hostType: h.hostType,
    bio: h.bio,
    kycStatus: h.kycStatus,
    payoutAccountStatus: h.payoutAccountStatus,
    attestationAcceptedAt: h.attestationAcceptedAt?.toISOString() ?? null,
    verifiedAt: h.verifiedAt?.toISOString() ?? null,
    suspendedAt: h.suspendedAt?.toISOString() ?? null,
    ratingAvg: h.ratingCount ? Math.round((h.ratingSum / h.ratingCount) * 10) / 10 : null,
    ratingCount: h.ratingCount,
    createdAt: h.createdAt.toISOString(),
  };
}

export function notificationPrefs(raw: unknown): NotificationPrefs {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...((raw as Partial<NotificationPrefs>) ?? {}) };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async getMe(userId: string): Promise<UserDto> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { hostProfile: true, driverProfile: true },
    });
    if (!u) throw AppError.notFound('User');
    return {
      id: u.id,
      phone: u.phone,
      name: u.name,
      email: u.email,
      roles: u.roles as Role[],
      status: u.status,
      emergencyContactName: u.driverProfile?.emergencyContactName ?? null,
      emergencyContactPhone: this.crypto.decrypt(u.driverProfile?.emergencyContactPhone ?? null),
      notificationPrefs: notificationPrefs(u.notificationPrefs),
      consentAcceptedAt: u.consentAcceptedAt?.toISOString() ?? null,
      hostProfile: u.hostProfile ? toHostProfileDto(u.hostProfile) : null,
      createdAt: u.createdAt.toISOString(),
    };
  }

  async updateMe(
    userId: string,
    input: {
      name?: string;
      email?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      notificationPrefs?: Partial<NotificationPrefs>;
    },
  ): Promise<UserDto> {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const data: Prisma.UserUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.notificationPrefs) {
      data.notificationPrefs = { ...notificationPrefs(current.notificationPrefs), ...input.notificationPrefs };
    }
    const profile: Prisma.DriverProfileUpdateInput = {};
    if (input.emergencyContactName !== undefined) profile.emergencyContactName = input.emergencyContactName;
    if (input.emergencyContactPhone !== undefined) profile.emergencyContactPhone = this.crypto.encrypt(input.emergencyContactPhone);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data }),
      this.prisma.driverProfile.upsert({
        where: { userId },
        create: {
          userId,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactPhone: this.crypto.encrypt(input.emergencyContactPhone ?? null),
        },
        update: profile,
      }),
    ]);
    return this.getMe(userId);
  }

  async registerDevice(userId: string, token: string, platform: string): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
  }

  async unregisterDevice(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
  }

  /**
   * DPDP-style deletion request: recorded and handled by support, because bookings,
   * payments and tax records may have legal retention requirements.
   */
  async requestDeletion(userId: string): Promise<{ requestedAt: string; note: string }> {
    const u = await this.prisma.user.update({ where: { id: userId }, data: { deletionRequestedAt: new Date() } });
    return {
      requestedAt: u.deletionRequestedAt!.toISOString(),
      note: 'Your request has been recorded. Our team will contact you; some transaction records may be retained where required by law.',
    };
  }
}
