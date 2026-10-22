import { Injectable } from '@nestjs/common';
import {
  APPROX_LOCATION_MAX_M,
  APPROX_LOCATION_MIN_M,
  CAPACITY_BLOCKING_STATUSES,
  offsetLocation,
  roundCoord,
  validateSlot,
  type AvailabilityInput,
  type ChargerManageDto,
  type CreateChargerInput,
  type PlatformSettings,
  type PricingUnit,
} from '@nexvolt/shared';
import { Prisma, type Charger } from '@prisma/client';
import { randomInt } from 'node:crypto';
import type { AuthUser } from '../../common/auth/auth-user';
import { AuditService } from '../../common/audit/audit.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppError } from '../../common/errors/app-error';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';
import { HostsService } from '../hosts/hosts.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { AvailabilityService } from './availability.service';
import { ChargerMapper, isVerifiedMeter, MANAGE_INCLUDE, REQUIRED_REVIEW_DOCS } from './charger.mapper';

/** Edits to these fields on a VERIFIED charger send it back to admin review. */
const MATERIAL_FIELDS = ['currentType', 'maxPowerKw', 'connectors', 'meterType', 'serialNumber', 'chargerMake', 'chargerModel', 'address', 'lat', 'lng', 'smartCapable', 'integrationProvider'] as const;

type UpdateInput = Partial<CreateChargerInput>;

@Injectable()
export class ChargersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hosts: HostsService,
    private readonly crypto: CryptoService,
    private readonly mapper: ChargerMapper,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly availability: AvailabilityService,
  ) {}

  kwhAllowed(c: Pick<Charger, 'meterType' | 'meterVerifiedAt'>, s: PlatformSettings): boolean {
    return s.kwhPricingEnabled && isVerifiedMeter(c);
  }

  /** Validate pricing type against metering capability and admin price bounds. */
  validatePricing(unit: PricingUnit, priceMinor: number, c: Pick<Charger, 'meterType' | 'meterVerifiedAt'>, s: PlatformSettings) {
    if (unit === 'PER_KWH') {
      if (!s.kwhPricingEnabled) {
        throw AppError.unprocessable('KWH_PRICING_DISABLED', 'Per-kWh pricing is not enabled on Nexvolt yet. Use hourly pricing.');
      }
      if (!isVerifiedMeter(c)) {
        throw AppError.unprocessable('KWH_PRICING_REQUIRES_VERIFIED_METER', 'Per-kWh pricing requires a sub-meter with an accepted calibration certificate.');
      }
      if (priceMinor < s.minKwhPriceMinor || priceMinor > s.maxKwhPriceMinor) {
        throw AppError.unprocessable('PRICE_OUT_OF_RANGE', `Per-kWh price must be between ₹${s.minKwhPriceMinor / 100} and ₹${s.maxKwhPriceMinor / 100}`);
      }
    } else if (priceMinor < s.minHourlyPriceMinor || priceMinor > s.maxHourlyPriceMinor) {
      throw AppError.unprocessable('PRICE_OUT_OF_RANGE', `Hourly price must be between ₹${s.minHourlyPriceMinor / 100} and ₹${s.maxHourlyPriceMinor / 100}`);
    }
  }

  private async setLocation(tx: Tx, id: string, lat: number, lng: number) {
    // Random 200–500 m offset generated once and stored, so it cannot be averaged away.
    const distance = randomInt(APPROX_LOCATION_MIN_M, APPROX_LOCATION_MAX_M + 1);
    const bearing = (randomInt(0, 36_000) / 36_000) * 2 * Math.PI;
    const pub = offsetLocation({ lat, lng }, distance, bearing);
    const pubLat = roundCoord(pub.lat, 5);
    const pubLng = roundCoord(pub.lng, 5);
    await tx.$executeRaw`
      UPDATE chargers SET
        location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        "publicLocation" = ST_SetSRID(ST_MakePoint(${pubLng}, ${pubLat}), 4326)::geography,
        "publicLat" = ${pubLat}, "publicLng" = ${pubLng}
      WHERE id = ${id}::uuid`;
  }

  async getOwned(user: AuthUser, id: string, tx?: Tx) {
    const host = await this.hosts.requireHost(user);
    const c = await (tx ?? this.prisma).charger.findFirst({ where: { id, hostId: host.id } });
    if (!c) throw AppError.notFound('Charger');
    return c;
  }

  async manageView(id: string): Promise<ChargerManageDto> {
    const c = await this.prisma.charger.findUniqueOrThrow({ where: { id }, include: MANAGE_INCLUDE });
    return this.mapper.toManage(c, this.kwhAllowed(c, await this.settings.get()));
  }

  async listMine(user: AuthUser): Promise<ChargerManageDto[]> {
    const host = await this.hosts.requireHost(user);
    const rows = await this.prisma.charger.findMany({ where: { hostId: host.id }, include: MANAGE_INCLUDE, orderBy: { createdAt: 'desc' } });
    const s = await this.settings.get();
    return Promise.all(rows.map((c) => this.mapper.toManage(c, this.kwhAllowed(c, s))));
  }

  async create(user: AuthUser, input: CreateChargerInput): Promise<ChargerManageDto> {
    const host = await this.hosts.requireActiveHost(user);
    const s = await this.settings.get();
    this.validatePricing(input.pricingUnit, input.unitPriceMinor, { meterType: input.meterType, meterVerifiedAt: null }, s);
    const id = await this.prisma.$transaction(async (tx) => {
      const c = await tx.charger.create({
        data: {
          hostId: host.id,
          title: input.title,
          description: input.description ?? null,
          currentType: input.currentType,
          maxPowerKw: new Prisma.Decimal(input.maxPowerKw),
          chargerMake: input.chargerMake ?? null,
          chargerModel: input.chargerModel ?? null,
          serialNumber: input.serialNumber ?? null,
          meterType: input.meterType,
          smartCapable: input.smartCapable ?? false,
          integrationProvider: input.integrationProvider ?? null,
          parkingType: input.parkingType,
          parkingNotes: input.parkingNotes ?? null,
          wheelchairAccessible: input.wheelchairAccessible ?? false,
          accessInstructions: this.crypto.encrypt(input.accessInstructions ?? null),
          safetyNotes: input.safetyNotes ?? null,
          pricingUnit: input.pricingUnit,
          unitPriceMinor: input.unitPriceMinor,
          cancellationPolicy: input.cancellationPolicy,
          addressLine1: this.crypto.encrypt(input.address.line1),
          addressLine2: this.crypto.encrypt(input.address.line2 ?? null),
          locality: input.address.locality,
          city: input.address.city,
          state: input.address.state,
          pincode: input.address.pincode,
          publicLat: 0,
          publicLng: 0,
          connectors: { create: input.connectors.map((k) => ({ connectorType: k.connectorType, powerKw: new Prisma.Decimal(k.powerKw) })) },
        },
      });
      await this.setLocation(tx, c.id, input.lat, input.lng);
      await this.audit.log({ actor: user, action: 'charger.create', resourceType: 'Charger', resourceId: c.id }, tx);
      return c.id;
    });
    return this.manageView(id);
  }

  async update(user: AuthUser, id: string, input: UpdateInput): Promise<ChargerManageDto> {
    const c = await this.getOwned(user, id);
    if (c.status === 'SUSPENDED') throw AppError.forbidden('This charger is suspended. Contact support.');
    const s = await this.settings.get();
    const unit = (input.pricingUnit ?? c.pricingUnit) as PricingUnit;
    const price = input.unitPriceMinor ?? c.unitPriceMinor;
    const meterType = input.meterType ?? c.meterType;
    // Changing meter type invalidates a prior meter verification.
    const meterVerifiedAt = input.meterType && input.meterType !== c.meterType ? null : c.meterVerifiedAt;
    if (input.pricingUnit || input.unitPriceMinor || input.meterType) this.validatePricing(unit, price, { meterType, meterVerifiedAt }, s);
    const maxPower = input.maxPowerKw ?? Number(c.maxPowerKw);
    if (input.connectors?.some((k) => k.powerKw > maxPower)) {
      throw AppError.unprocessable('INVALID_CONNECTOR_POWER', 'Connector power cannot exceed the charger’s maximum safe power');
    }
    const material = MATERIAL_FIELDS.some((f) => (input as Record<string, unknown>)[f] !== undefined);
    const backToReview = material && (c.status === 'VERIFIED' || c.status === 'PENDING_REVIEW');

    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.ChargerUpdateInput = {
        title: input.title,
        description: input.description,
        currentType: input.currentType,
        maxPowerKw: input.maxPowerKw == null ? undefined : new Prisma.Decimal(input.maxPowerKw),
        chargerMake: input.chargerMake,
        chargerModel: input.chargerModel,
        serialNumber: input.serialNumber,
        meterType: input.meterType,
        meterVerifiedAt,
        smartCapable: input.smartCapable,
        integrationProvider: input.integrationProvider,
        parkingType: input.parkingType,
        parkingNotes: input.parkingNotes,
        wheelchairAccessible: input.wheelchairAccessible,
        accessInstructions: input.accessInstructions === undefined ? undefined : this.crypto.encrypt(input.accessInstructions),
        safetyNotes: input.safetyNotes,
        pricingUnit: input.pricingUnit,
        unitPriceMinor: input.unitPriceMinor,
        cancellationPolicy: input.cancellationPolicy,
      };
      if (input.address) {
        Object.assign(data, {
          addressLine1: this.crypto.encrypt(input.address.line1),
          addressLine2: this.crypto.encrypt(input.address.line2 ?? null),
          locality: input.address.locality,
          city: input.address.city,
          state: input.address.state,
          pincode: input.address.pincode,
        });
      }
      if (backToReview) {
        Object.assign(data, { status: 'PENDING_REVIEW', isPublished: false, verifiedAt: null, verifiedById: null });
        await tx.chargerVerification.create({ data: { chargerId: id, status: 'PENDING', notes: 'Re-review required after material changes' } });
      }
      await tx.charger.update({ where: { id }, data });
      if (input.connectors) {
        await tx.chargerConnector.deleteMany({ where: { chargerId: id } });
        await tx.chargerConnector.createMany({
          data: input.connectors.map((k) => ({ chargerId: id, connectorType: k.connectorType, powerKw: new Prisma.Decimal(k.powerKw) })),
        });
      }
      if (input.lat != null && input.lng != null) await this.setLocation(tx, id, input.lat, input.lng);
      await this.audit.log(
        { actor: user, action: 'charger.update', resourceType: 'Charger', resourceId: id, newValue: { fields: Object.keys(input), sentBackToReview: backToReview } },
        tx,
      );
    });
    return this.manageView(id);
  }

  async submitForReview(user: AuthUser, id: string): Promise<ChargerManageDto> {
    const host = await this.hosts.requireActiveHost(user);
    const c = await this.getOwned(user, id);
    if (!['DRAFT', 'REJECTED'].includes(c.status)) {
      throw AppError.conflict('INVALID_STATE', `A charger in ${c.status} cannot be submitted`);
    }
    const problems: string[] = [];
    if (!host.attestationAcceptedAt) problems.push('Accept the host attestation');
    if (host.kycStatus === 'NOT_STARTED' || host.kycStatus === 'REJECTED') problems.push('Submit your identity document for verification');
    const rules = await this.prisma.chargerAvailabilityRule.count({ where: { chargerId: id } });
    if (rules === 0) problems.push('Add at least one weekly availability window');
    const docs = await this.prisma.verificationDocument.findMany({
      where: { chargerId: id, status: { in: ['PENDING_REVIEW', 'ACCEPTED'] } },
      select: { docType: true },
    });
    for (const group of REQUIRED_REVIEW_DOCS) {
      if (!docs.some((d) => group.includes(d.docType))) problems.push(`Upload ${group.join(' or ').toLowerCase().replace(/_/g, ' ')}`);
    }
    if (problems.length) throw AppError.unprocessable('REVIEW_REQUIREMENTS_MISSING', 'Complete these steps before submitting', problems);
    await this.prisma.$transaction(async (tx) => {
      await tx.charger.update({ where: { id }, data: { status: 'PENDING_REVIEW' } });
      await tx.chargerVerification.create({ data: { chargerId: id, status: 'PENDING' } });
      await this.audit.log({ actor: user, action: 'charger.submit', resourceType: 'Charger', resourceId: id, oldValue: { status: c.status }, newValue: { status: 'PENDING_REVIEW' } }, tx);
    });
    return this.manageView(id);
  }

  async setPublished(user: AuthUser, id: string, publish: boolean): Promise<ChargerManageDto> {
    const host = await this.hosts.requireActiveHost(user);
    const c = await this.getOwned(user, id);
    if (publish) {
      if (c.status !== 'VERIFIED') throw AppError.unprocessable('CHARGER_NOT_VERIFIED', 'Only admin-verified chargers can be published');
      if (host.kycStatus !== 'VERIFIED') throw AppError.unprocessable('HOST_NOT_VERIFIED', 'Your identity must be verified before publishing');
    }
    await this.prisma.charger.update({ where: { id }, data: { isPublished: publish } });
    await this.audit.log({ actor: user, action: publish ? 'charger.publish' : 'charger.unpublish', resourceType: 'Charger', resourceId: id });
    return this.manageView(id);
  }

  async setPaused(user: AuthUser, id: string, paused: boolean, reason?: string) {
    await this.getOwned(user, id);
    await this.prisma.charger.update({ where: { id }, data: paused ? { pausedAt: new Date(), pauseReason: reason ?? null } : { pausedAt: null, pauseReason: null } });
    await this.audit.log({ actor: user, action: paused ? 'charger.pause' : 'charger.resume', resourceType: 'Charger', resourceId: id, reason });
    const upcoming = await this.prisma.booking.count({
      where: { chargerId: id, status: { in: ['CONFIRMED', 'AWAITING_HOST_APPROVAL', 'HELD', 'PENDING_PAYMENT'] }, startAt: { gt: new Date() } },
    });
    return {
      charger: await this.manageView(id),
      upcomingBookings: upcoming,
      notice: paused && upcoming > 0 ? 'Pausing hides the charger from search but does not cancel existing bookings. Cancel them from your booking queue if you cannot honour them.' : null,
    };
  }

  async setAvailability(user: AuthUser, id: string, input: AvailabilityInput) {
    const c = await this.getOwned(user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.chargerAvailabilityRule.deleteMany({ where: { chargerId: id } });
      if (input.rules.length) {
        await tx.chargerAvailabilityRule.createMany({ data: input.rules.map((r) => ({ chargerId: id, ...r })) });
      }
      await tx.charger.update({
        where: { id },
        data: {
          bufferMinutes: input.bufferMinutes,
          minDurationMinutes: input.minDurationMinutes,
          maxDurationMinutes: input.maxDurationMinutes,
          approvalMode: input.approvalMode,
        },
      });
      await this.audit.log({ actor: user, action: 'charger.availability.update', resourceType: 'Charger', resourceId: id, oldValue: { approvalMode: c.approvalMode }, newValue: input }, tx);
    });
    return { charger: await this.manageView(id), conflicts: await this.conflictsAfterChange(id) };
  }

  /** Upcoming bookings that no longer fit availability. They are NOT auto-cancelled. */
  async conflictsAfterChange(chargerId: string) {
    const charger = await this.prisma.charger.findUniqueOrThrow({ where: { id: chargerId } });
    const upcoming = await this.prisma.booking.findMany({
      where: { chargerId, status: { in: CAPACITY_BLOCKING_STATUSES }, startAt: { gt: new Date() } },
      orderBy: { startAt: 'asc' },
      take: 100,
    });
    const out: Array<{ bookingId: string; code: string; startAt: string }> = [];
    for (const b of upcoming) {
      const ctx = await this.availability.context(charger, b.startAt, b.endAt, { excludeBookingId: b.id });
      const r = validateSlot({ start: b.startAt, end: b.endAt, now: new Date(0), ...ctx, constraints: { ...ctx.constraints, minLeadTimeMinutes: 0, maxAdvanceBookingDays: 100_000, minDurationMinutes: 0, maxDurationMinutes: 100_000, slotStepMinutes: 1 } });
      if (!r.ok) out.push({ bookingId: b.id, code: b.code, startAt: b.startAt.toISOString() });
    }
    return out;
  }

  async addException(user: AuthUser, id: string, input: { date: string; type: 'BLACKOUT' | 'CUSTOM_HOURS'; startMinute?: number | null; endMinute?: number | null; reason?: string | null }) {
    await this.getOwned(user, id);
    await this.prisma.availabilityException.create({
      data: {
        chargerId: id,
        date: new Date(`${input.date}T00:00:00Z`),
        type: input.type,
        startMinute: input.type === 'BLACKOUT' ? null : input.startMinute,
        endMinute: input.type === 'BLACKOUT' ? null : input.endMinute,
        reason: input.reason ?? null,
      },
    });
    return { charger: await this.manageView(id), conflicts: await this.conflictsAfterChange(id) };
  }

  async removeException(user: AuthUser, id: string, exceptionId: string) {
    await this.getOwned(user, id);
    const r = await this.prisma.availabilityException.deleteMany({ where: { id: exceptionId, chargerId: id } });
    if (r.count === 0) throw AppError.notFound('Exception');
    return this.manageView(id);
  }

  async createPhotoUpload(user: AuthUser, id: string, input: { mimeType: string; sizeBytes: number }) {
    await this.getOwned(user, id);
    const count = await this.prisma.chargerPhoto.count({ where: { chargerId: id } });
    if (count >= 10) throw AppError.unprocessable('PHOTO_LIMIT', 'Up to 10 photos per charger');
    const key = this.storage.newKey(`chargers/${id}/photos`, input.mimeType);
    const upload = await this.storage.presignUpload(key, input.mimeType, input.sizeBytes);
    const photo = await this.prisma.chargerPhoto.create({
      data: { chargerId: id, storageKey: key, mimeType: input.mimeType, sizeBytes: input.sizeBytes, sortOrder: count },
    });
    return { photoId: photo.id, upload: { ...upload, key: undefined } };
  }

  async completePhotoUpload(user: AuthUser, id: string, photoId: string) {
    await this.getOwned(user, id);
    const p = await this.prisma.chargerPhoto.findFirst({ where: { id: photoId, chargerId: id } });
    if (!p) throw AppError.notFound('Photo');
    const check = await this.storage.verifyUpload(p.storageKey, p.mimeType, 8 * 1024 * 1024);
    await this.prisma.chargerPhoto.update({ where: { id: photoId }, data: { status: check.ok ? 'UPLOADED' : 'REJECTED', sizeBytes: check.sizeBytes } });
    if (!check.ok) throw AppError.unprocessable('UPLOAD_REJECTED', check.reason ?? 'Upload rejected');
    return this.manageView(id);
  }

  async removePhoto(user: AuthUser, id: string, photoId: string) {
    await this.getOwned(user, id);
    await this.prisma.chargerPhoto.deleteMany({ where: { id: photoId, chargerId: id } });
    return this.manageView(id);
  }
}
