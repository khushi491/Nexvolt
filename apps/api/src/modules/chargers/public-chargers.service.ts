import { Injectable } from '@nestjs/common';
import {
  checkCompatibility,
  validateSlot,
  type ChargerPublicDto,
  type ChargerSearchResultDto,
  type CompatibilityDto,
  type ConnectorType,
  type CurrentType,
  type ReviewDto,
  type SearchChargersInput,
  SearchChargersSchema,
} from '@nexvolt/shared';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AvailabilityService } from './availability.service';
import { ChargerMapper, isVerifiedMeter, PUBLIC_INCLUDE, type ChargerWithPublic } from './charger.mapper';

type SearchInput = z.output<typeof SearchChargersSchema>;
type VehicleForCompat = { id: string; connectors: { connectorType: ConnectorType }[]; maxAcKw: Prisma.Decimal; maxDcKw: Prisma.Decimal | null };

/** Only these chargers may ever appear publicly. Mirrors assertBookable(). */
const DISCOVERABLE = Prisma.sql`c.status = 'VERIFIED' AND c."isPublished" = true AND c."pausedAt" IS NULL AND h."suspendedAt" IS NULL AND u.status = 'ACTIVE'`;

export function compatibilityFor(vehicle: VehicleForCompat, c: { currentType: CurrentType; connectors: { connectorType: ConnectorType; powerKw: Prisma.Decimal | number }[] }): CompatibilityDto {
  const r = checkCompatibility(
    { connectors: vehicle.connectors.map((k) => k.connectorType), maxAcKw: Number(vehicle.maxAcKw), maxDcKw: vehicle.maxDcKw == null ? null : Number(vehicle.maxDcKw) },
    c.connectors.map((k) => ({ connectorType: k.connectorType, powerKw: Number(k.powerKw) })),
    c.currentType,
  );
  const best = [...r.connectors].sort((a, b) => b.effectiveKw - a.effectiveKw)[0];
  return {
    vehicleId: vehicle.id,
    compatible: r.compatible,
    reason: r.reason,
    bestConnector: best?.connectorType,
    effectiveKw: best?.effectiveKw,
  };
}

@Injectable()
export class PublicChargersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: ChargerMapper,
    private readonly availability: AvailabilityService,
  ) {}

  private async vehicleFor(user: AuthUser | undefined, vehicleId: string | undefined) {
    if (!vehicleId) return null;
    if (!user) throw AppError.forbidden('Sign in to filter by your vehicle');
    const v = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, ownerId: user.id, deletedAt: null }, include: { connectors: true } });
    if (!v) throw AppError.notFound('Vehicle');
    return v;
  }

  /** PostGIS KNN + radius search over APPROXIMATE public points. */
  async search(rawInput: SearchChargersInput, user?: AuthUser): Promise<{ items: ChargerSearchResultDto[]; approximate: true }> {
    const q: SearchInput = SearchChargersSchema.parse(rawInput);
    const vehicle = await this.vehicleFor(user, q.vehicleId);
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography`;
    const conds: Prisma.Sql[] = [DISCOVERABLE, Prisma.sql`ST_DWithin(c."publicLocation", ${point}, ${q.radiusKm * 1000})`];
    if (q.connector) {
      conds.push(Prisma.sql`EXISTS (SELECT 1 FROM charger_connectors cc WHERE cc."chargerId" = c.id AND cc."connectorType" = ${q.connector}::"ConnectorType")`);
    }
    if (vehicle) {
      const types = vehicle.connectors.map((k) => k.connectorType);
      conds.push(Prisma.sql`EXISTS (SELECT 1 FROM charger_connectors cc WHERE cc."chargerId" = c.id AND cc."connectorType"::text = ANY(${types}))`);
    }
    if (q.currentType) conds.push(Prisma.sql`c."currentType" = ${q.currentType}::"CurrentType"`);
    if (q.minPowerKw != null) conds.push(Prisma.sql`c."maxPowerKw" >= ${q.minPowerKw}`);
    if (q.pricingUnit) conds.push(Prisma.sql`c."pricingUnit" = ${q.pricingUnit}::"PricingUnit"`);
    if (q.maxPriceMinor != null) conds.push(Prisma.sql`c."unitPriceMinor" <= ${q.maxPriceMinor}`);
    if (q.wheelchairAccessible) conds.push(Prisma.sql`c."wheelchairAccessible" = true`);
    if (q.parkingType) conds.push(Prisma.sql`c."parkingType" = ${q.parkingType}::"ParkingType"`);
    if (q.verifiedMeterOnly) conds.push(Prisma.sql`c."meterVerifiedAt" IS NOT NULL AND c."meterType" IN ('SEPARATE_SUBMETER', 'SMART_OCPP')`);

    const rows = await this.prisma.$queryRaw<Array<{ id: string; distance_m: number }>>`
      SELECT c.id, ST_Distance(c."publicLocation", ${point}) AS distance_m
      FROM chargers c
      JOIN host_profiles h ON h.id = c."hostId"
      JOIN users u ON u.id = h."userId"
      WHERE ${Prisma.join(conds, ' AND ')}
      ORDER BY c."publicLocation" <-> ${point}
      LIMIT ${q.limit} OFFSET ${q.offset}`;
    if (rows.length === 0) return { items: [], approximate: true };

    const chargers = await this.prisma.charger.findMany({ where: { id: { in: rows.map((r) => r.id) } }, include: PUBLIC_INCLUDE });
    const byId = new Map(chargers.map((c) => [c.id, c]));
    const start = q.startAt ? new Date(q.startAt) : null;
    const end = q.endAt ? new Date(q.endAt) : null;
    if (start && end && end <= start) throw AppError.unprocessable('INVALID_RANGE', 'End time must be after start time');

    const items: ChargerSearchResultDto[] = [];
    for (const r of rows) {
      const c = byId.get(r.id);
      if (!c) continue;
      let available: boolean | null = null;
      if (start && end) {
        const ctx = await this.availability.context(c, start, end);
        available = validateSlot({ start, end, now: new Date(), ...ctx }).ok;
        if (!available) continue; // the date/time filter excludes unavailable chargers
      }
      const compatibility = vehicle ? compatibilityFor(vehicle, c) : undefined;
      if (compatibility && !compatibility.compatible) continue;
      const [photo] = await this.mapper.photoUrls(c.photos.slice(0, 1));
      items.push({
        id: c.id,
        title: c.title,
        currentType: c.currentType,
        maxPowerKw: Number(c.maxPowerKw),
        connectors: c.connectors.map((k) => ({ connectorType: k.connectorType, powerKw: Number(k.powerKw) })),
        pricingUnit: c.pricingUnit,
        unitPriceMinor: c.unitPriceMinor,
        approxLocation: { lat: Number(c.publicLat), lng: Number(c.publicLng) },
        approxDistanceKm: Math.round(Number(r.distance_m) / 100) / 10,
        locality: c.locality,
        city: c.city,
        parkingType: c.parkingType,
        wheelchairAccessible: c.wheelchairAccessible,
        verifiedMeter: isVerifiedMeter(c),
        approvalMode: c.approvalMode,
        ratingAvg: c.ratingCount ? Math.round((c.ratingSum / c.ratingCount) * 10) / 10 : null,
        ratingCount: c.ratingCount,
        photoUrl: photo?.url ?? null,
        hostIdentityVerified: c.host.kycStatus === 'VERIFIED',
        isSample: c.isSample,
        availableForRequestedSlot: available,
        compatibility,
      });
    }
    return { items, approximate: true };
  }

  async getDiscoverable(id: string): Promise<ChargerWithPublic> {
    const c = await this.prisma.charger.findUnique({ where: { id }, include: { ...PUBLIC_INCLUDE, host: { include: { user: { select: { status: true } } } } } });
    if (!c || c.status !== 'VERIFIED' || !c.isPublished || c.host.suspendedAt || c.host.user.status !== 'ACTIVE') {
      // Same response whether missing or hidden — avoids leaking unpublished listings.
      throw AppError.notFound('Charger');
    }
    return c;
  }

  async detail(id: string, user?: AuthUser, vehicleId?: string): Promise<ChargerPublicDto> {
    const c = await this.getDiscoverable(id);
    const dto = await this.mapper.toPublic(c);
    if (user) {
      dto.isFavorite = !!(await this.prisma.favorite.findUnique({ where: { userId_chargerId: { userId: user.id, chargerId: id } } }));
      const vehicle = vehicleId
        ? await this.vehicleFor(user, vehicleId)
        : await this.prisma.vehicle.findFirst({ where: { ownerId: user.id, deletedAt: null, isDefault: true }, include: { connectors: true } });
      if (vehicle) dto.compatibility = compatibilityFor(vehicle, c);
    }
    return dto;
  }

  async reviews(chargerId: string): Promise<ReviewDto[]> {
    await this.getDiscoverable(chargerId);
    const rows = await this.prisma.review.findMany({
      where: { chargerId, status: 'PUBLISHED' },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      chargerId: r.chargerId,
      rating: r.rating,
      comment: r.comment,
      // First name only, for privacy.
      authorName: (r.author.name ?? 'Nexvolt driver').split(' ')[0]!,
      hostReply: r.hostReply,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
