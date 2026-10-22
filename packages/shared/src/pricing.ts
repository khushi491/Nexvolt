import type { CancellationPolicy, PricingUnit } from './enums';
import { applyBps, assertMinor, BPS_DENOMINATOR, proportion } from './money';
import type { CancellationTier, PlatformSettings } from './settings';

export interface PriceInput {
  pricingUnit: PricingUnit;
  /** Paise per hour or per kWh. */
  unitPriceMinor: number;
  durationMinutes: number;
  /** Effective power the vehicle can draw from this connector (kW). */
  effectivePowerKw: number;
}

export interface LineItem {
  code: 'CHARGING_FEE' | 'SERVICE_FEE' | 'SERVICE_FEE_TAX';
  label: string;
  amountMinor: number;
}

export interface PriceBreakdown {
  pricingUnit: PricingUnit;
  unitPriceMinor: number;
  durationMinutes: number;
  /** Estimated energy in Wh — always an ESTIMATE, never billed directly for per-hour pricing. */
  estimatedEnergyWh: number;
  chargingFeeMinor: number;
  serviceFeeMinor: number;
  serviceFeeTaxMinor: number;
  totalMinor: number;
  /** Host-side figures (not shown to drivers as their charges). */
  commissionBps: number;
  commissionMinor: number;
  hostEarningsBeforeGatewayFeesMinor: number;
  /** True when the final charge may be lower once verified kWh are known. */
  isEstimate: boolean;
  lineItems: LineItem[];
}

type FeeSettings = Pick<
  PlatformSettings,
  'commissionBps' | 'driverServiceFeeBps' | 'serviceFeeTaxBps' | 'estimateLoadFactorBps'
>;

/** Estimated deliverable energy in Wh (integer). Purely an estimate. */
export function estimateEnergyWh(
  effectivePowerKw: number,
  durationMinutes: number,
  loadFactorBps: number,
): number {
  if (effectivePowerKw <= 0 || durationMinutes <= 0) return 0;
  const wh = (effectivePowerKw * 1000 * durationMinutes) / 60;
  return Math.floor((wh * loadFactorBps) / BPS_DENOMINATOR);
}

export function chargingFeeForEnergy(unitPriceMinorPerKwh: number, energyWh: number): number {
  return Math.round((unitPriceMinorPerKwh * energyWh) / 1000);
}

export function chargingFeeForDuration(
  unitPriceMinorPerHour: number,
  durationMinutes: number,
): number {
  return Math.round((unitPriceMinorPerHour * durationMinutes) / 60);
}

function build(
  chargingFeeMinor: number,
  base: Omit<
    PriceBreakdown,
    | 'chargingFeeMinor'
    | 'serviceFeeMinor'
    | 'serviceFeeTaxMinor'
    | 'totalMinor'
    | 'commissionMinor'
    | 'hostEarningsBeforeGatewayFeesMinor'
    | 'lineItems'
  >,
  fees: FeeSettings,
): PriceBreakdown {
  const serviceFeeMinor = applyBps(chargingFeeMinor, fees.driverServiceFeeBps);
  const serviceFeeTaxMinor = applyBps(serviceFeeMinor, fees.serviceFeeTaxBps);
  const commissionMinor = applyBps(chargingFeeMinor, fees.commissionBps);
  const lineItems: LineItem[] = [
    {
      code: 'CHARGING_FEE',
      label: base.pricingUnit === 'PER_HOUR' ? 'Charging slot fee' : 'Charging energy (estimate)',
      amountMinor: chargingFeeMinor,
    },
  ];
  if (serviceFeeMinor > 0)
    lineItems.push({
      code: 'SERVICE_FEE',
      label: 'Nexvolt service fee',
      amountMinor: serviceFeeMinor,
    });
  if (serviceFeeTaxMinor > 0)
    lineItems.push({
      code: 'SERVICE_FEE_TAX',
      label: 'Tax on service fee',
      amountMinor: serviceFeeTaxMinor,
    });
  return {
    ...base,
    chargingFeeMinor,
    serviceFeeMinor,
    serviceFeeTaxMinor,
    totalMinor: chargingFeeMinor + serviceFeeMinor + serviceFeeTaxMinor,
    commissionMinor,
    hostEarningsBeforeGatewayFeesMinor: chargingFeeMinor - commissionMinor,
    lineItems,
  };
}

/**
 * Price quote shown before payment.
 * PER_HOUR: billed for the reserved duration.
 * PER_KWH: the driver prepays an estimate; after verified metering the unused
 * part is refunded. The final charge never exceeds the prepaid amount.
 */
export function quotePrice(input: PriceInput, fees: FeeSettings): PriceBreakdown {
  assertMinor(input.unitPriceMinor, 'unitPriceMinor');
  if (input.durationMinutes <= 0) throw new RangeError('durationMinutes must be positive');
  const estimatedEnergyWh = estimateEnergyWh(
    input.effectivePowerKw,
    input.durationMinutes,
    fees.estimateLoadFactorBps,
  );
  const chargingFeeMinor =
    input.pricingUnit === 'PER_HOUR'
      ? chargingFeeForDuration(input.unitPriceMinor, input.durationMinutes)
      : chargingFeeForEnergy(input.unitPriceMinor, estimatedEnergyWh);
  return build(
    chargingFeeMinor,
    {
      pricingUnit: input.pricingUnit,
      unitPriceMinor: input.unitPriceMinor,
      durationMinutes: input.durationMinutes,
      estimatedEnergyWh,
      commissionBps: fees.commissionBps,
      isEstimate: input.pricingUnit === 'PER_KWH',
    },
    fees,
  );
}

export interface KwhSettlement {
  billedEnergyWh: number;
  finalChargingFeeMinor: number;
  finalServiceFeeMinor: number;
  finalServiceFeeTaxMinor: number;
  finalTotalMinor: number;
  refundDueMinor: number;
  cappedAtPrepaid: boolean;
}

/** Final settlement of a per-kWh booking from verified energy. */
export function settleKwh(
  prepaid: PriceBreakdown,
  verifiedEnergyWh: number,
  fees: FeeSettings,
): KwhSettlement {
  if (prepaid.pricingUnit !== 'PER_KWH')
    throw new Error('settleKwh only applies to PER_KWH bookings');
  if (!Number.isInteger(verifiedEnergyWh) || verifiedEnergyWh < 0)
    throw new RangeError('verifiedEnergyWh must be a non-negative integer');
  const raw = chargingFeeForEnergy(prepaid.unitPriceMinor, verifiedEnergyWh);
  const cappedAtPrepaid = raw > prepaid.chargingFeeMinor;
  const finalChargingFeeMinor = Math.min(raw, prepaid.chargingFeeMinor);
  const finalServiceFeeMinor = applyBps(finalChargingFeeMinor, fees.driverServiceFeeBps);
  const finalServiceFeeTaxMinor = applyBps(finalServiceFeeMinor, fees.serviceFeeTaxBps);
  const finalTotalMinor = finalChargingFeeMinor + finalServiceFeeMinor + finalServiceFeeTaxMinor;
  return {
    billedEnergyWh: verifiedEnergyWh,
    finalChargingFeeMinor,
    finalServiceFeeMinor,
    finalServiceFeeTaxMinor,
    finalTotalMinor,
    refundDueMinor: Math.max(0, prepaid.totalMinor - finalTotalMinor),
    cappedAtPrepaid,
  };
}

export interface RefundComputation {
  refundBps: number;
  refundMinor: number;
  /** Portion of the refund that reduces the host's charging fee. */
  chargingFeeRefundMinor: number;
  retainedMinor: number;
  reason: string;
}

export type Canceller = 'DRIVER' | 'HOST' | 'ADMIN_FULL_REFUND';

/**
 * Cancellation refund. Host or admin-initiated (fault) cancellations are always
 * fully refunded. Driver cancellations follow the charger's policy tiers.
 */
export function computeCancellationRefund(args: {
  paidTotalMinor: number;
  chargingFeeMinor: number;
  policy: CancellationPolicy;
  tiers: Record<CancellationPolicy, CancellationTier[]>;
  minutesBeforeStart: number;
  cancelledBy: Canceller;
}): RefundComputation {
  const { paidTotalMinor, chargingFeeMinor } = args;
  assertMinor(paidTotalMinor);
  let refundBps = 0;
  let reason: string;
  if (args.cancelledBy !== 'DRIVER') {
    refundBps = BPS_DENOMINATOR;
    reason =
      args.cancelledBy === 'HOST'
        ? 'Cancelled by host — full refund'
        : 'Cancelled by Nexvolt — full refund';
  } else if (args.minutesBeforeStart < 0) {
    reason = 'Cancelled after the slot started — not refundable under policy';
  } else {
    const tiers = [...args.tiers[args.policy]].sort(
      (a, b) => b.minMinutesBeforeStart - a.minMinutesBeforeStart,
    );
    const tier = tiers.find((t) => args.minutesBeforeStart >= t.minMinutesBeforeStart);
    refundBps = tier?.refundBps ?? 0;
    reason = tier
      ? `${args.policy.toLowerCase()} policy: ${refundBps / 100}% refund`
      : `${args.policy.toLowerCase()} policy: no refund this close to start`;
  }
  const refundMinor = applyBps(paidTotalMinor, refundBps);
  const chargingFeeRefundMinor =
    paidTotalMinor === 0 ? 0 : proportion(chargingFeeMinor, refundMinor, paidTotalMinor);
  return {
    refundBps,
    refundMinor,
    chargingFeeRefundMinor: Math.min(chargingFeeRefundMinor, chargingFeeMinor),
    retainedMinor: paidTotalMinor - refundMinor,
    reason,
  };
}

/** Host ledger lines for a captured booking payment. Signed amounts (+ credit to host). */
export function hostLedgerForCapture(args: {
  chargingFeeMinor: number;
  commissionBps: number;
  gatewayFeeMinor: number;
  gatewayFeeBearer: 'HOST' | 'PLATFORM';
  paidTotalMinor: number;
}): Array<{ type: 'BOOKING_GROSS' | 'PLATFORM_COMMISSION' | 'PAYMENT_FEE'; amountMinor: number }> {
  const lines: Array<{
    type: 'BOOKING_GROSS' | 'PLATFORM_COMMISSION' | 'PAYMENT_FEE';
    amountMinor: number;
  }> = [
    { type: 'BOOKING_GROSS', amountMinor: args.chargingFeeMinor },
    {
      type: 'PLATFORM_COMMISSION',
      amountMinor: -applyBps(args.chargingFeeMinor, args.commissionBps),
    },
  ];
  if (args.gatewayFeeBearer === 'HOST' && args.gatewayFeeMinor > 0) {
    // Gateway fee is charged on the whole payment; the host bears the share attributable to the charging fee.
    const share = proportion(
      args.gatewayFeeMinor,
      args.chargingFeeMinor,
      Math.max(1, args.paidTotalMinor),
    );
    lines.push({ type: 'PAYMENT_FEE', amountMinor: -share });
  }
  return lines;
}

/** Host ledger reversal for a refund of `chargingFeeRefundMinor` of the charging fee. */
export function hostLedgerForRefund(args: {
  chargingFeeMinor: number;
  chargingFeeRefundMinor: number;
  commissionBps: number;
}): Array<{ type: 'REFUND_REVERSAL' | 'COMMISSION_REVERSAL'; amountMinor: number }> {
  if (args.chargingFeeRefundMinor <= 0) return [];
  const originalCommission = applyBps(args.chargingFeeMinor, args.commissionBps);
  const commissionBack = proportion(
    originalCommission,
    args.chargingFeeRefundMinor,
    Math.max(1, args.chargingFeeMinor),
  );
  return [
    { type: 'REFUND_REVERSAL', amountMinor: -args.chargingFeeRefundMinor },
    { type: 'COMMISSION_REVERSAL', amountMinor: commissionBack },
  ];
}
