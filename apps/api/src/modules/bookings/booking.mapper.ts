import { Injectable } from '@nestjs/common';
import { addMinutes, maskPhone, type BookingDto, type MeterAssessment, type SessionDto } from '@nexvolt/shared';
import type { Booking, ChargingSession, MeterEvidence, MeterReading, Payment, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { ChargerMapper } from '../chargers/charger.mapper';
import { SettingsService } from '../settings/settings.service';

export const BOOKING_INCLUDE = {
  charger: { include: { photos: { where: { status: 'UPLOADED' as const }, orderBy: { sortOrder: 'asc' as const }, take: 1 } } },
  vehicle: true,
  driver: { select: { id: true, name: true, phone: true } },
  payments: { orderBy: { createdAt: 'desc' as const } },
  session: { include: { readings: { include: { evidence: true }, orderBy: { recordedAt: 'asc' as const } } } },
  review: { select: { id: true } },
  disputes: { where: { status: { in: ['OPEN' as const, 'UNDER_REVIEW' as const] } }, select: { id: true } },
} satisfies Prisma.BookingInclude;

export type BookingFull = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

export function toSessionDto(s: ChargingSession & { readings: (MeterReading & { evidence: MeterEvidence[] })[] }, b: Booking): SessionDto {
  return {
    id: s.id,
    bookingId: s.bookingId,
    mode: s.mode,
    status: s.status,
    startedAt: s.startedAt?.toISOString() ?? null,
    endedAt: s.endedAt?.toISOString() ?? null,
    durationMinutes: s.durationMinutes,
    estimatedEnergyWh: b.estimatedEnergyWh,
    meteredEnergyWh: s.meteredEnergyWh,
    readings: s.readings.map((r) => ({
      id: r.id,
      phase: r.phase,
      readingKwh: r.readingKwh.toFixed(3),
      recordedByRole: r.recordedByRole,
      source: r.source,
      hasEvidence: r.evidence.some((e) => e.status === 'UPLOADED'),
      recordedAt: r.recordedAt.toISOString(),
    })),
    assessment: (s.assessment as MeterAssessment | null) ?? null,
    driverStartConfirmedAt: s.driverStartConfirmedAt?.toISOString() ?? null,
    hostStartConfirmedAt: s.hostStartConfirmedAt?.toISOString() ?? null,
    driverEndConfirmedAt: s.driverEndConfirmedAt?.toISOString() ?? null,
    hostEndConfirmedAt: s.hostEndConfirmedAt?.toISOString() ?? null,
    liveTelemetryAvailable: false,
  };
}

/** The payment that matters for display: a live one if any, else the most recent. */
export function primaryPayment(payments: Payment[]): Payment | null {
  return payments.find((p) => ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'AUTHORIZED'].includes(p.status)) ?? payments[0] ?? null;
}

@Injectable()
export class BookingMapper {
  constructor(
    private readonly chargers: ChargerMapper,
    private readonly settings: SettingsService,
  ) {}

  async toDto(b: BookingFull, viewer: AuthUser): Promise<BookingDto> {
    const s = await this.settings.get();
    const isHostView = !!viewer.hostProfileId && viewer.hostProfileId === b.charger.hostId;
    const showHost = isHostView || viewer.isStaff;
    const [photo] = await this.chargers.photoUrls(b.charger.photos);
    const p = primaryPayment(b.payments);
    const total = b.finalTotalMinor ?? b.totalMinor;
    return {
      id: b.id,
      code: b.code,
      status: b.status,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      holdExpiresAt: b.holdExpiresAt?.toISOString() ?? null,
      connectorType: b.connectorType,
      approvalMode: b.approvalMode,
      cancellationPolicy: b.cancellationPolicy,
      charger: {
        id: b.charger.id,
        title: b.charger.title,
        locality: b.charger.locality,
        city: b.charger.city,
        approxLocation: { lat: Number(b.charger.publicLat), lng: Number(b.charger.publicLng) },
        photoUrl: photo?.url ?? null,
        isSample: b.charger.isSample,
      },
      vehicle: { id: b.vehicle.id, label: b.vehicle.nickname ?? `${b.vehicle.manufacturer} ${b.vehicle.model}` },
      driver: showHost ? { id: b.driver.id, name: b.driver.name, phoneMasked: maskPhone(b.driver.phone) } : undefined,
      pricing: {
        pricingUnit: b.pricingUnit,
        unitPriceMinor: b.unitPriceMinor,
        durationMinutes: Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60_000),
        estimatedEnergyWh: b.estimatedEnergyWh,
        chargingFeeMinor: b.finalChargingFeeMinor ?? b.chargingFeeMinor,
        serviceFeeMinor: b.serviceFeeMinor,
        serviceFeeTaxMinor: b.serviceFeeTaxMinor,
        totalMinor: total,
        isEstimate: b.pricingUnit === 'PER_KWH' && b.finalTotalMinor == null,
        lineItems: [
          { code: 'CHARGING_FEE', label: b.pricingUnit === 'PER_HOUR' ? 'Charging slot fee' : 'Charging energy', amountMinor: b.finalChargingFeeMinor ?? b.chargingFeeMinor },
          ...(b.serviceFeeMinor ? [{ code: 'SERVICE_FEE' as const, label: 'Nexvolt service fee', amountMinor: b.serviceFeeMinor }] : []),
          ...(b.serviceFeeTaxMinor ? [{ code: 'SERVICE_FEE_TAX' as const, label: 'Tax on service fee', amountMinor: b.serviceFeeTaxMinor }] : []),
        ],
        currency: 'INR',
      },
      hostView: showHost
        ? {
            commissionBps: b.commissionBps,
            commissionMinor: Math.round(((b.finalChargingFeeMinor ?? b.chargingFeeMinor) * b.commissionBps) / 10_000),
            hostEarningsBeforeGatewayFeesMinor: Math.round(((b.finalChargingFeeMinor ?? b.chargingFeeMinor) * (10_000 - b.commissionBps)) / 10_000),
          }
        : undefined,
      payment: p
        ? {
            id: p.id,
            provider: p.provider,
            isDemo: p.isDemo,
            status: p.status,
            amountMinor: p.amountMinor,
            amountRefundedMinor: p.amountRefundedMinor,
            method: p.method,
            capturedAt: p.capturedAt?.toISOString() ?? null,
          }
        : null,
      session: b.session ? toSessionDto(b.session, b) : null,
      accessAvailableAt: ['CONFIRMED', 'CHECKED_IN', 'CHARGING'].includes(b.status) ? addMinutes(b.startAt, -s.accessRevealMinutesBefore).toISOString() : null,
      canCancel: viewer.id === b.driverId
        ? ['AWAITING_HOST_APPROVAL', 'HELD', 'PENDING_PAYMENT', 'CONFIRMED'].includes(b.status)
        : isHostView && ['AWAITING_HOST_APPROVAL', 'CONFIRMED', 'CHECKED_IN'].includes(b.status),
      hasReview: !!b.review,
      hasOpenDispute: b.disputes.length > 0,
      cancelReason: b.cancelReason,
      createdAt: b.createdAt.toISOString(),
    };
  }
}
