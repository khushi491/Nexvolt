import { describe, expect, it } from 'vitest';
import {
  computeCancellationRefund,
  estimateEnergyWh,
  hostLedgerForCapture,
  hostLedgerForRefund,
  quotePrice,
  settleKwh,
} from '../src/pricing';
import { DEFAULT_SETTINGS } from '../src/settings';

const fees = { ...DEFAULT_SETTINGS };

describe('pricing', () => {
  it('prices hourly slots by reserved duration', () => {
    const q = quotePrice(
      {
        pricingUnit: 'PER_HOUR',
        unitPriceMinor: 12_000,
        durationMinutes: 90,
        effectivePowerKw: 7.2,
      },
      fees,
    );
    expect(q.chargingFeeMinor).toBe(18_000);
    expect(q.serviceFeeMinor).toBe(0);
    expect(q.totalMinor).toBe(18_000);
    expect(q.commissionMinor).toBe(1_800);
    expect(q.hostEarningsBeforeGatewayFeesMinor).toBe(16_200);
    expect(q.isEstimate).toBe(false);
    expect(q.lineItems).toHaveLength(1);
  });
  it('adds a transparent service fee and tax line when configured', () => {
    const q = quotePrice(
      { pricingUnit: 'PER_HOUR', unitPriceMinor: 10_000, durationMinutes: 60, effectivePowerKw: 7 },
      { ...fees, driverServiceFeeBps: 500, serviceFeeTaxBps: 1800 },
    );
    expect(q.serviceFeeMinor).toBe(500);
    expect(q.serviceFeeTaxMinor).toBe(90);
    expect(q.totalMinor).toBe(10_590);
    expect(q.lineItems.map((l) => l.code)).toEqual([
      'CHARGING_FEE',
      'SERVICE_FEE',
      'SERVICE_FEE_TAX',
    ]);
  });
  it('estimates kWh conservatively and flags it as an estimate', () => {
    expect(estimateEnergyWh(7.2, 60, 9000)).toBe(6480);
    const q = quotePrice(
      { pricingUnit: 'PER_KWH', unitPriceMinor: 1_800, durationMinutes: 60, effectivePowerKw: 7.2 },
      fees,
    );
    expect(q.estimatedEnergyWh).toBe(6480);
    expect(q.chargingFeeMinor).toBe(11_664);
    expect(q.isEstimate).toBe(true);
  });
  it('settles kWh bookings, refunding unused prepayment and capping at prepaid', () => {
    const q = quotePrice(
      { pricingUnit: 'PER_KWH', unitPriceMinor: 2_000, durationMinutes: 60, effectivePowerKw: 7 },
      fees,
    );
    const s = settleKwh(q, 3_000, fees);
    expect(s.finalChargingFeeMinor).toBe(6_000);
    expect(s.refundDueMinor).toBe(q.totalMinor - 6_000);
    const over = settleKwh(q, 50_000, fees);
    expect(over.cappedAtPrepaid).toBe(true);
    expect(over.finalTotalMinor).toBe(q.totalMinor);
    expect(over.refundDueMinor).toBe(0);
  });
});

describe('cancellation refunds', () => {
  const base = {
    paidTotalMinor: 20_000,
    chargingFeeMinor: 20_000,
    tiers: DEFAULT_SETTINGS.cancellationTiers,
  };
  it('gives full refunds for host cancellations regardless of timing', () => {
    expect(
      computeCancellationRefund({
        ...base,
        policy: 'STRICT',
        minutesBeforeStart: 5,
        cancelledBy: 'HOST',
      }).refundMinor,
    ).toBe(20_000);
  });
  it('applies policy tiers for driver cancellations', () => {
    expect(
      computeCancellationRefund({
        ...base,
        policy: 'MODERATE',
        minutesBeforeStart: 7 * 60,
        cancelledBy: 'DRIVER',
      }).refundMinor,
    ).toBe(20_000);
    expect(
      computeCancellationRefund({
        ...base,
        policy: 'MODERATE',
        minutesBeforeStart: 120,
        cancelledBy: 'DRIVER',
      }).refundMinor,
    ).toBe(10_000);
    expect(
      computeCancellationRefund({
        ...base,
        policy: 'MODERATE',
        minutesBeforeStart: 30,
        cancelledBy: 'DRIVER',
      }).refundMinor,
    ).toBe(0);
    expect(
      computeCancellationRefund({
        ...base,
        policy: 'FLEXIBLE',
        minutesBeforeStart: -1,
        cancelledBy: 'DRIVER',
      }).refundMinor,
    ).toBe(0);
  });
  it('splits refunds proportionally between charging fee and service fee', () => {
    const r = computeCancellationRefund({
      paidTotalMinor: 10_500,
      chargingFeeMinor: 10_000,
      tiers: DEFAULT_SETTINGS.cancellationTiers,
      policy: 'FLEXIBLE',
      minutesBeforeStart: 30,
      cancelledBy: 'DRIVER',
    });
    expect(r.refundMinor).toBe(5_250);
    expect(r.chargingFeeRefundMinor).toBe(5_000);
    expect(r.retainedMinor).toBe(5_250);
  });
});

describe('host ledger', () => {
  it('records gross, commission and gateway fee on capture', () => {
    const lines = hostLedgerForCapture({
      chargingFeeMinor: 20_000,
      commissionBps: 1000,
      gatewayFeeMinor: 472,
      gatewayFeeBearer: 'HOST',
      paidTotalMinor: 20_000,
    });
    expect(lines).toEqual([
      { type: 'BOOKING_GROSS', amountMinor: 20_000 },
      { type: 'PLATFORM_COMMISSION', amountMinor: -2_000 },
      { type: 'PAYMENT_FEE', amountMinor: -472 },
    ]);
    expect(lines.reduce((s, l) => s + l.amountMinor, 0)).toBe(17_528);
  });
  it('omits the gateway fee when the platform bears it', () => {
    expect(
      hostLedgerForCapture({
        chargingFeeMinor: 20_000,
        commissionBps: 1000,
        gatewayFeeMinor: 472,
        gatewayFeeBearer: 'PLATFORM',
        paidTotalMinor: 20_000,
      }),
    ).toHaveLength(2);
  });
  it('reverses proportional commission on refunds', () => {
    expect(
      hostLedgerForRefund({
        chargingFeeMinor: 20_000,
        chargingFeeRefundMinor: 10_000,
        commissionBps: 1000,
      }),
    ).toEqual([
      { type: 'REFUND_REVERSAL', amountMinor: -10_000 },
      { type: 'COMMISSION_REVERSAL', amountMinor: 1_000 },
    ]);
    expect(
      hostLedgerForRefund({
        chargingFeeMinor: 20_000,
        chargingFeeRefundMinor: 0,
        commissionBps: 1000,
      }),
    ).toEqual([]);
  });
});
