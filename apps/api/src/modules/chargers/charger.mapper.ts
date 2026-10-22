import { Injectable } from '@nestjs/common';
import {
  CANCELLATION_POLICY_COPY,
  type ChargerManageDto,
  type ChargerPublicDto,
  type ConnectorType,
  type DocumentType,
} from '@nexvolt/shared';
import type {
  AvailabilityException,
  Charger,
  ChargerAvailabilityRule,
  ChargerConnector,
  ChargerPhoto,
  ChargerVerification,
  HostProfile,
  VerificationDocument,
} from '@prisma/client';
import { CryptoService } from '../../common/crypto/crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toDocumentDto } from '../documents/documents.service';
import { StorageService } from '../storage/storage.service';

export type ChargerWithPublic = Charger & {
  connectors: ChargerConnector[];
  photos: ChargerPhoto[];
  host: HostProfile;
};

export type ChargerWithAll = ChargerWithPublic & {
  availabilityRules: ChargerAvailabilityRule[];
  exceptions: AvailabilityException[];
  documents: VerificationDocument[];
  verifications: ChargerVerification[];
};

export const PUBLIC_INCLUDE = {
  connectors: true,
  photos: { where: { status: 'UPLOADED' as const }, orderBy: { sortOrder: 'asc' as const } },
  host: true,
};

export const MANAGE_INCLUDE = {
  ...PUBLIC_INCLUDE,
  photos: { orderBy: { sortOrder: 'asc' as const } },
  availabilityRules: { orderBy: [{ dayOfWeek: 'asc' as const }, { startMinute: 'asc' as const }] },
  exceptions: { orderBy: { date: 'asc' as const } },
  documents: { orderBy: { createdAt: 'desc' as const } },
  verifications: { orderBy: { submittedAt: 'desc' as const }, take: 10 },
};

const avg = (sum: number, count: number) => (count ? Math.round((sum / count) * 10) / 10 : null);

export function isVerifiedMeter(c: Pick<Charger, 'meterType' | 'meterVerifiedAt'>): boolean {
  return (c.meterType === 'SEPARATE_SUBMETER' || c.meterType === 'SMART_OCPP') && !!c.meterVerifiedAt;
}

export function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class ChargerMapper {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly storage: StorageService,
  ) {}

  async photoUrls(photos: ChargerPhoto[]): Promise<Array<{ id: string; url: string }>> {
    const out: Array<{ id: string; url: string }> = [];
    for (const p of photos) {
      if (p.status !== 'UPLOADED') continue;
      const url = await this.storage.presignDownload(p.storageKey);
      if (url) out.push({ id: p.id, url });
    }
    return out;
  }

  async toPublic(c: ChargerWithPublic): Promise<ChargerPublicDto> {
    return {
      id: c.id,
      title: c.title,
      description: c.description,
      currentType: c.currentType,
      maxPowerKw: Number(c.maxPowerKw),
      connectors: c.connectors.map((k) => ({ connectorType: k.connectorType as ConnectorType, powerKw: Number(k.powerKw) })),
      chargerMake: c.chargerMake,
      chargerModel: c.chargerModel,
      meterType: c.meterType,
      verifiedMeter: isVerifiedMeter(c),
      smartCapable: c.smartCapable,
      parkingType: c.parkingType,
      parkingNotes: c.parkingNotes,
      wheelchairAccessible: c.wheelchairAccessible,
      safetyNotes: c.safetyNotes,
      pricingUnit: c.pricingUnit,
      unitPriceMinor: c.unitPriceMinor,
      cancellationPolicy: c.cancellationPolicy,
      cancellationPolicyText: CANCELLATION_POLICY_COPY[c.cancellationPolicy],
      approvalMode: c.approvalMode,
      minDurationMinutes: c.minDurationMinutes,
      maxDurationMinutes: c.maxDurationMinutes,
      bufferMinutes: c.bufferMinutes,
      approxLocation: { lat: Number(c.publicLat), lng: Number(c.publicLng) },
      locality: c.locality,
      city: c.city,
      state: c.state,
      photos: await this.photoUrls(c.photos),
      host: {
        displayName: c.host.displayName,
        hostType: c.host.hostType,
        identityVerified: c.host.kycStatus === 'VERIFIED',
        ratingAvg: avg(c.host.ratingSum, c.host.ratingCount),
        ratingCount: c.host.ratingCount,
        memberSince: c.host.createdAt.toISOString(),
      },
      ratingAvg: avg(c.ratingSum, c.ratingCount),
      ratingCount: c.ratingCount,
      isSample: c.isSample,
      isPaused: !!c.pausedAt,
    };
  }

  async exactLocation(chargerId: string): Promise<{ lat: number; lng: number }> {
    const rows = await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
      SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM chargers WHERE id = ${chargerId}::uuid`;
    return { lat: Number(rows[0]?.lat ?? 0), lng: Number(rows[0]?.lng ?? 0) };
  }

  privateAddress(c: Charger) {
    return {
      line1: this.crypto.decrypt(c.addressLine1),
      line2: this.crypto.decrypt(c.addressLine2),
      locality: c.locality,
      city: c.city,
      state: c.state,
      pincode: c.pincode,
    };
  }

  async toManage(c: ChargerWithAll, kwhPricingAllowed: boolean): Promise<ChargerManageDto> {
    const pub = await this.toPublic(c);
    const { host: _host, ...rest } = pub;
    return {
      ...rest,
      photos: await this.photoUrls(c.photos),
      hostId: c.hostId,
      status: c.status,
      isPublished: c.isPublished,
      pausedAt: c.pausedAt?.toISOString() ?? null,
      pauseReason: c.pauseReason,
      serialNumber: c.serialNumber,
      integrationProvider: c.integrationProvider,
      accessInstructions: this.crypto.decrypt(c.accessInstructions),
      address: this.privateAddress(c),
      exactLocation: await this.exactLocation(c.id),
      rules: c.availabilityRules.map((r) => ({ id: r.id, dayOfWeek: r.dayOfWeek, startMinute: r.startMinute, endMinute: r.endMinute })),
      exceptions: c.exceptions.map((e) => ({
        id: e.id,
        date: dateOnly(e.date),
        type: e.type,
        startMinute: e.startMinute,
        endMinute: e.endMinute,
        reason: e.reason,
      })),
      documents: c.documents.map(toDocumentDto),
      verifications: c.verifications.map((v) => ({
        id: v.id,
        status: v.status,
        submittedAt: v.submittedAt.toISOString(),
        decidedAt: v.decidedAt?.toISOString() ?? null,
        notes: v.notes,
        checklist: (v.checklist as Record<string, boolean> | null) ?? null,
      })),
      kwhPricingAllowed,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}

export const REQUIRED_REVIEW_DOCS: DocumentType[][] = [
  ['PROPERTY_AUTHORIZATION', 'SOCIETY_NOC'],
  ['ELECTRICAL_SAFETY_CERT'],
];
