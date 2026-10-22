import type { ConnectorType, CurrentType } from './enums';

export interface ChargerConnectorLike {
  connectorType: ConnectorType;
  powerKw: number;
}

export interface VehicleLike {
  connectors: ConnectorType[];
  maxAcKw: number;
  maxDcKw?: number | null;
}

/** Connectors that are DC-only regardless of the charger's declared current type. */
const DC_CONNECTORS: ConnectorType[] = ['CCS2', 'CHADEMO', 'BHARAT_DC_001'];

export function connectorCurrent(type: ConnectorType, chargerCurrent: CurrentType): CurrentType {
  return DC_CONNECTORS.includes(type) ? 'DC' : chargerCurrent;
}

export function compatibleConnectors(
  vehicle: Pick<VehicleLike, 'connectors'>,
  charger: ChargerConnectorLike[],
): ChargerConnectorLike[] {
  return charger.filter((c) => vehicle.connectors.includes(c.connectorType));
}

/**
 * The power the vehicle can actually draw: the lower of charger connector
 * rating and the vehicle's onboard AC / DC acceptance. Returns 0 when the
 * vehicle cannot accept that current type.
 */
export function effectivePowerKw(
  connector: ChargerConnectorLike,
  chargerCurrent: CurrentType,
  vehicle: VehicleLike,
): number {
  const current = connectorCurrent(connector.connectorType, chargerCurrent);
  const vehicleMax = current === 'AC' ? vehicle.maxAcKw : (vehicle.maxDcKw ?? 0);
  return Math.max(0, Math.min(connector.powerKw, vehicleMax));
}

export interface CompatibilityResult {
  compatible: boolean;
  reason?: 'NO_COMMON_CONNECTOR' | 'CURRENT_NOT_SUPPORTED';
  connectors: Array<ChargerConnectorLike & { effectiveKw: number }>;
}

export function checkCompatibility(
  vehicle: VehicleLike,
  chargerConnectors: ChargerConnectorLike[],
  chargerCurrent: CurrentType,
): CompatibilityResult {
  const common = compatibleConnectors(vehicle, chargerConnectors);
  if (common.length === 0) return { compatible: false, reason: 'NO_COMMON_CONNECTOR', connectors: [] };
  const withPower = common
    .map((c) => ({ ...c, effectiveKw: effectivePowerKw(c, chargerCurrent, vehicle) }))
    .filter((c) => c.effectiveKw > 0);
  if (withPower.length === 0) return { compatible: false, reason: 'CURRENT_NOT_SUPPORTED', connectors: [] };
  return { compatible: true, connectors: withPower };
}
