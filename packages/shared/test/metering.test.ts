import { describe, expect, it } from 'vitest';
import { assessReadings, kwhStringToWh, maxPlausibleEnergyWh, whToKwhString } from '../src/metering';
import { checkCompatibility } from '../src/compatibility';
import { normalizeIndianPhone } from '../src/phone';

const base = { maxPowerKw: 7.2, durationMinutes: 120, toleranceWh: 100, toleranceBps: 200, headroomBps: 500 };

describe('metering', () => {
  it('parses kWh strings to integer Wh exactly', () => {
    expect(kwhStringToWh('1234.567')).toBe(1_234_567);
    expect(kwhStringToWh('10.5')).toBe(10_500);
    expect(whToKwhString(1_234_567)).toBe('1234.567');
    expect(() => kwhStringToWh('12.3456')).toThrow();
    expect(() => kwhStringToWh('-1')).toThrow();
  });
  it('computes the physical maximum with headroom', () => {
    expect(maxPlausibleEnergyWh(7.2, 120, 500)).toBe(15_120);
  });
  it('waits for both parties', () => {
    expect(assessReadings({ ...base, host: {}, driver: {} }).status).toBe('AWAITING_READINGS');
    expect(assessReadings({ ...base, host: { startWh: 0, endWh: 10_000 }, driver: { startWh: 0 } }).status).toBe('AWAITING_COUNTERPARTY');
  });
  it('bills the lower reading when within tolerance', () => {
    const a = assessReadings({ ...base, host: { startWh: 100_000, endWh: 110_000 }, driver: { startWh: 100_000, endWh: 109_900 } });
    expect(a.status).toBe('AGREED');
    expect(a.billableEnergyWh).toBe(9_900);
  });
  it('flags discrepancies beyond tolerance', () => {
    const a = assessReadings({ ...base, host: { startWh: 100_000, endWh: 112_000 }, driver: { startWh: 100_000, endWh: 108_000 } });
    expect(a.status).toBe('DISCREPANCY');
    expect(a.differenceWh).toBe(4_000);
  });
  it('flags implausible and invalid energy', () => {
    expect(assessReadings({ ...base, host: { startWh: 0, endWh: 20_000 }, driver: { startWh: 0, endWh: 20_000 } }).status).toBe('IMPLAUSIBLE');
    expect(assessReadings({ ...base, host: { startWh: 5_000, endWh: 4_000 }, driver: {} }).status).toBe('INVALID');
  });
});

describe('compatibility', () => {
  const nexon = { connectors: ['CCS2', 'TYPE_2'] as const, maxAcKw: 7.2, maxDcKw: 50 };
  it('caps power by the vehicle onboard charger', () => {
    const r = checkCompatibility({ ...nexon, connectors: [...nexon.connectors] }, [{ connectorType: 'TYPE_2', powerKw: 22 }], 'AC');
    expect(r.compatible).toBe(true);
    expect(r.connectors[0]?.effectiveKw).toBe(7.2);
  });
  it('rejects chargers with no common connector', () => {
    const r = checkCompatibility({ connectors: ['TYPE_2'], maxAcKw: 3.3 }, [{ connectorType: 'CCS2', powerKw: 30 }], 'DC');
    expect(r).toMatchObject({ compatible: false, reason: 'NO_COMMON_CONNECTOR' });
  });
  it('rejects DC connectors for vehicles without DC acceptance', () => {
    const r = checkCompatibility({ connectors: ['CCS2'], maxAcKw: 7.2, maxDcKw: null }, [{ connectorType: 'CCS2', powerKw: 30 }], 'DC');
    expect(r).toMatchObject({ compatible: false, reason: 'CURRENT_NOT_SUPPORTED' });
  });
});

describe('phone', () => {
  it('normalises Indian mobiles', () => {
    expect(normalizeIndianPhone('98765 43210')).toBe('+919876543210');
    expect(normalizeIndianPhone('+91-98765-43210')).toBe('+919876543210');
    expect(normalizeIndianPhone('09876543210')).toBe('+919876543210');
    expect(normalizeIndianPhone('5876543210')).toBeNull();
    expect(normalizeIndianPhone('+1 415 555 0100')).toBeNull();
  });
});
