/**
 * Manual metering assessment. Readings are entered as kWh strings with up to 3
 * decimals and converted to integer Wh so no floating-point maths touches billing.
 *
 * IMPORTANT: Meter accuracy class and calibration requirements must be confirmed
 * with a qualified electrical expert before any commercial per-kWh billing.
 */
export function kwhStringToWh(kwh: string): number {
  const m = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(kwh.trim());
  if (!m) throw new RangeError(`Invalid kWh reading: ${kwh}`);
  return Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0'));
}

export function whToKwhString(wh: number): string {
  const sign = wh < 0 ? '-' : '';
  const abs = Math.abs(wh);
  return `${sign}${Math.floor(abs / 1000)}.${String(abs % 1000).padStart(3, '0')}`;
}

export interface PartyReadings {
  startWh?: number | null;
  endWh?: number | null;
}

export type MeterAssessmentStatus =
  | 'AWAITING_READINGS'
  | 'AWAITING_COUNTERPARTY'
  | 'AGREED'
  | 'DISCREPANCY'
  | 'IMPLAUSIBLE'
  | 'INVALID';

export interface MeterAssessment {
  status: MeterAssessmentStatus;
  /** Energy to bill (Wh) when status === AGREED. */
  billableEnergyWh?: number;
  hostEnergyWh?: number;
  driverEnergyWh?: number;
  differenceWh?: number;
  toleranceWh?: number;
  maxPlausibleWh: number;
  message: string;
}

export function maxPlausibleEnergyWh(
  maxPowerKw: number,
  durationMinutes: number,
  headroomBps: number,
): number {
  const base = (maxPowerKw * 1000 * Math.max(0, durationMinutes)) / 60;
  return Math.ceil((base * (10_000 + headroomBps)) / 10_000);
}

/**
 * Both-party confirmation: when the host's and driver's energy deltas agree within
 * tolerance, bill the LOWER of the two. Otherwise flag a discrepancy for admin
 * reconciliation. Energy above the physical maximum is flagged implausible.
 */
export function assessReadings(args: {
  host: PartyReadings;
  driver: PartyReadings;
  maxPowerKw: number;
  durationMinutes: number;
  toleranceWh: number;
  toleranceBps: number;
  headroomBps: number;
}): MeterAssessment {
  const maxPlausibleWh = maxPlausibleEnergyWh(
    args.maxPowerKw,
    args.durationMinutes,
    args.headroomBps,
  );
  const delta = (p: PartyReadings) =>
    p.startWh != null && p.endWh != null ? p.endWh - p.startWh : undefined;
  const hostEnergyWh = delta(args.host);
  const driverEnergyWh = delta(args.driver);

  if (hostEnergyWh === undefined && driverEnergyWh === undefined) {
    return {
      status: 'AWAITING_READINGS',
      maxPlausibleWh,
      message: 'Start and end meter readings are required.',
    };
  }
  for (const e of [hostEnergyWh, driverEnergyWh]) {
    if (e !== undefined && e < 0) {
      return {
        status: 'INVALID',
        hostEnergyWh,
        driverEnergyWh,
        maxPlausibleWh,
        message: 'End reading is lower than start reading.',
      };
    }
  }
  if (hostEnergyWh === undefined || driverEnergyWh === undefined) {
    return {
      status: 'AWAITING_COUNTERPARTY',
      hostEnergyWh,
      driverEnergyWh,
      maxPlausibleWh,
      message: 'Waiting for the other party to confirm meter readings.',
    };
  }
  const larger = Math.max(hostEnergyWh, driverEnergyWh);
  const toleranceWh = Math.max(args.toleranceWh, Math.ceil((larger * args.toleranceBps) / 10_000));
  const differenceWh = Math.abs(hostEnergyWh - driverEnergyWh);
  if (differenceWh > toleranceWh) {
    return {
      status: 'DISCREPANCY',
      hostEnergyWh,
      driverEnergyWh,
      differenceWh,
      toleranceWh,
      maxPlausibleWh,
      message:
        'Host and driver readings differ beyond tolerance. A dispute has been opened for review.',
    };
  }
  const billableEnergyWh = Math.min(hostEnergyWh, driverEnergyWh);
  if (billableEnergyWh > maxPlausibleWh) {
    return {
      status: 'IMPLAUSIBLE',
      hostEnergyWh,
      driverEnergyWh,
      differenceWh,
      toleranceWh,
      maxPlausibleWh,
      message: 'Recorded energy exceeds what this charger can deliver in the session time.',
    };
  }
  return {
    status: 'AGREED',
    billableEnergyWh,
    hostEnergyWh,
    driverEnergyWh,
    differenceWh,
    toleranceWh,
    maxPlausibleWh,
    message: 'Readings agree within tolerance.',
  };
}
