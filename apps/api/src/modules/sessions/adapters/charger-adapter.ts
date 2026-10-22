/**
 * Hardware integration boundary. Neither a QR scan nor a phone app can control arbitrary
 * chargers: remote start/stop or live meter values require an authenticated integration
 * with the specific charger (e.g. OCPP 1.6J/2.0.1 via a certified CSMS) that has been tested
 * with approved hardware. Until then every charger uses ManualMeterAdapter.
 */
export interface MeterSample {
  energyWh: number;
  measuredAt: Date;
  source: 'CHARGER_INTEGRATION';
}

export interface ChargerAdapter {
  readonly id: string;
  /** True only for integrations that are implemented, certified and enabled for this charger. */
  readonly supportsRemoteControl: boolean;
  readonly supportsLiveMetering: boolean;
  startSession(chargerId: string, connectorId: string): Promise<{ transactionId: string }>;
  stopSession(chargerId: string, transactionId: string): Promise<void>;
  readMeter(chargerId: string, transactionId: string): Promise<MeterSample>;
}

export class NotSupportedError extends Error {
  constructor(what: string) {
    super(`${what} is not supported for this charger. Use manual meter confirmation.`);
  }
}

/** Default: no control, no telemetry. Sessions are confirmed by both parties with meter readings. */
export class ManualMeterAdapter implements ChargerAdapter {
  readonly id = 'manual';
  readonly supportsRemoteControl = false;
  readonly supportsLiveMetering = false;
  startSession(): Promise<never> {
    return Promise.reject(new NotSupportedError('Remote start'));
  }
  stopSession(): Promise<never> {
    return Promise.reject(new NotSupportedError('Remote stop'));
  }
  readMeter(): Promise<never> {
    return Promise.reject(new NotSupportedError('Live metering'));
  }
}

/**
 * Placeholder for a future OCPP integration. Deliberately disabled: it must not be enabled
 * until implemented against a CSMS, security-reviewed, and tested with approved hardware.
 */
export class OcppAdapterPlaceholder implements ChargerAdapter {
  readonly id = 'ocpp';
  readonly supportsRemoteControl = false;
  readonly supportsLiveMetering = false;
  startSession(): Promise<never> {
    return Promise.reject(new NotSupportedError('OCPP remote start (not implemented)'));
  }
  stopSession(): Promise<never> {
    return Promise.reject(new NotSupportedError('OCPP remote stop (not implemented)'));
  }
  readMeter(): Promise<never> {
    return Promise.reject(new NotSupportedError('OCPP meter values (not implemented)'));
  }
}

/** Always returns the manual adapter in this release; no integration is enabled. */
export function adapterFor(_charger: { integrationProvider: string | null; smartCapable: boolean }): ChargerAdapter {
  return new ManualMeterAdapter();
}
