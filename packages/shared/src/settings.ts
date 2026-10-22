import type { CancellationPolicy } from './enums';

/**
 * Platform settings with safe defaults. Admins can override each key via the
 * PlatformSetting table; every change is audit-logged.
 * Defaults are for DEMO only and carry no claim of legal/commercial validity.
 */
export interface CancellationTier {
  /** Cancel at least this many minutes before start ... */
  minMinutesBeforeStart: number;
  /** ... to receive this refund (bps of charging fee + service fee). */
  refundBps: number;
}

export interface PlatformSettings {
  /** Commission retained from the host's charging fee. Demo default 10%. */
  commissionBps: number;
  /** Optional driver-side service fee. Default 0 (no hidden fees). */
  driverServiceFeeBps: number;
  /** Tax applied to the driver service fee only, when configured after professional review. */
  serviceFeeTaxBps: number;
  /** Who bears the gateway processing fee in the ledger. */
  gatewayFeeBearer: 'HOST' | 'PLATFORM';
  /** kWh pricing stays disabled until tariff/resale/metering rules are reviewed. */
  kwhPricingEnabled: boolean;
  minHourlyPriceMinor: number;
  maxHourlyPriceMinor: number;
  minKwhPriceMinor: number;
  maxKwhPriceMinor: number;
  holdMinutes: number;
  paymentWindowMinutes: number;
  hostApprovalWindowMinutes: number;
  /** Exact address becomes visible this many minutes before booking start. */
  accessRevealMinutesBefore: number;
  noShowGraceMinutes: number;
  /** Time after completion during which either party may dispute before settlement. */
  disputeWindowHours: number;
  /** Meter discrepancy tolerance: max(absolute Wh, relative bps of energy). */
  meterToleranceWh: number;
  meterToleranceBps: number;
  /** Plausibility headroom over max power × duration. */
  meterPlausibilityHeadroomBps: number;
  /** Load factor used only for kWh *estimates* (not billing). */
  estimateLoadFactorBps: number;
  minLeadTimeMinutes: number;
  maxAdvanceBookingDays: number;
  slotStepMinutes: number;
  cancellationTiers: Record<CancellationPolicy, CancellationTier[]>;
  /** Auto-suspend a charger when a CRITICAL safety incident is reported. */
  autoSuspendOnCriticalIncident: boolean;
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  commissionBps: 1000,
  driverServiceFeeBps: 0,
  serviceFeeTaxBps: 0,
  gatewayFeeBearer: 'HOST',
  kwhPricingEnabled: false,
  minHourlyPriceMinor: 2_000, // ₹20/h
  maxHourlyPriceMinor: 50_000, // ₹500/h
  minKwhPriceMinor: 800, // ₹8/kWh
  maxKwhPriceMinor: 4_000, // ₹40/kWh
  holdMinutes: 10,
  paymentWindowMinutes: 15,
  hostApprovalWindowMinutes: 120,
  accessRevealMinutesBefore: 24 * 60,
  noShowGraceMinutes: 30,
  disputeWindowHours: 24,
  meterToleranceWh: 100,
  meterToleranceBps: 200,
  meterPlausibilityHeadroomBps: 500,
  estimateLoadFactorBps: 9000,
  minLeadTimeMinutes: 15,
  maxAdvanceBookingDays: 30,
  slotStepMinutes: 15,
  cancellationTiers: {
    FLEXIBLE: [
      { minMinutesBeforeStart: 60, refundBps: 10_000 },
      { minMinutesBeforeStart: 0, refundBps: 5_000 },
    ],
    MODERATE: [
      { minMinutesBeforeStart: 6 * 60, refundBps: 10_000 },
      { minMinutesBeforeStart: 60, refundBps: 5_000 },
    ],
    STRICT: [
      { minMinutesBeforeStart: 24 * 60, refundBps: 10_000 },
      { minMinutesBeforeStart: 6 * 60, refundBps: 5_000 },
    ],
  },
  autoSuspendOnCriticalIncident: true,
};

export type SettingKey = keyof PlatformSettings;
export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

export const SETTING_DESCRIPTIONS: Record<SettingKey, string> = {
  commissionBps:
    'Platform commission on the host charging fee (basis points). Demo default 1000 = 10%.',
  driverServiceFeeBps: 'Driver-side service fee (bps). Shown as a separate line item.',
  serviceFeeTaxBps: 'Tax on the driver service fee (bps). Configure only after tax review.',
  gatewayFeeBearer:
    'Whether gateway fees are deducted from host earnings or absorbed by the platform.',
  kwhPricingEnabled:
    'Allow per-kWh pricing for chargers with an accepted meter calibration certificate.',
  minHourlyPriceMinor: 'Minimum hourly price (paise).',
  maxHourlyPriceMinor: 'Maximum hourly price (paise).',
  minKwhPriceMinor: 'Minimum per-kWh price (paise).',
  maxKwhPriceMinor: 'Maximum per-kWh price (paise).',
  holdMinutes: 'How long a slot is held while the driver reviews checkout.',
  paymentWindowMinutes: 'How long a slot stays reserved after a payment order is created.',
  hostApprovalWindowMinutes: 'How long a host has to approve a manual-approval request.',
  accessRevealMinutesBefore:
    'Minutes before start when the exact address becomes visible to the driver.',
  noShowGraceMinutes: 'Grace period after start before a host may mark no-show.',
  disputeWindowHours: 'Hours after completion before earnings become payout-eligible.',
  meterToleranceWh: 'Absolute tolerance (Wh) between driver and host meter readings.',
  meterToleranceBps: 'Relative tolerance (bps of energy) between driver and host readings.',
  meterPlausibilityHeadroomBps:
    'Headroom above max power × duration before energy is flagged implausible.',
  estimateLoadFactorBps: 'Load factor for kWh estimates only.',
  minLeadTimeMinutes: 'Minimum minutes between booking creation and slot start.',
  maxAdvanceBookingDays: 'How far ahead drivers can book.',
  slotStepMinutes: 'Booking start/end granularity in minutes.',
  cancellationTiers: 'Refund tiers by cancellation policy.',
  autoSuspendOnCriticalIncident:
    'Automatically suspend a charger when a CRITICAL incident is reported.',
};

export const CANCELLATION_POLICY_COPY: Record<CancellationPolicy, string> = {
  FLEXIBLE: 'Full refund up to 1 hour before start; 50% after that until start.',
  MODERATE: 'Full refund up to 6 hours before start; 50% up to 1 hour before.',
  STRICT: 'Full refund up to 24 hours before start; 50% up to 6 hours before.',
};
