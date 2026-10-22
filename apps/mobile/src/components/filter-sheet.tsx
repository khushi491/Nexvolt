import { CONNECTOR_LABELS, ConnectorType, ParkingType } from '@nexvolt/shared';
import { Modal, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { label } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';
import { Banner, Button, Chip, Row, T } from './ui';

export interface Filters {
  radiusKm: number;
  connector?: ConnectorType;
  currentType?: 'AC' | 'DC';
  minPowerKw?: number;
  maxPriceRupees?: number;
  onlyCompatible: boolean;
  wheelchairAccessible: boolean;
  parkingType?: ParkingType;
  verifiedMeterOnly: boolean;
  when: 'any' | 'now' | 'today-evening' | 'tomorrow-morning';
  durationMinutes: number;
}

export const DEFAULT_FILTERS: Filters = { radiusKm: 10, onlyCompatible: true, wheelchairAccessible: false, verifiedMeterOnly: false, when: 'any', durationMinutes: 60 };

export function activeFilterCount(f: Filters): number {
  return [f.radiusKm !== 10, !!f.connector, !!f.currentType, !!f.minPowerKw, !!f.maxPriceRupees, f.wheelchairAccessible, !!f.parkingType, f.verifiedMeterOnly, f.when !== 'any'].filter(Boolean).length;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing[2] }}>
      <T.H3 style={{ fontSize: 16 }}>{title}</T.H3>
      <Row>{children}</Row>
    </View>
  );
}

function Toggle({ title, value, onChange }: { title: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
      <T.Body style={{ flex: 1 }}>{title}</T.Body>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={title} trackColor={{ true: colors.brand.primary }} />
    </View>
  );
}

export function FilterSheet({ visible, value, onChange, onClose, hasVehicle }: { visible: boolean; value: Filters; onChange: (f: Filters) => void; onClose: () => void; hasVehicle: boolean }) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...value, [k]: v });
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface.background }}>
        <Row style={{ justifyContent: 'space-between', padding: spacing[4] }}>
          <T.H2>Filters</T.H2>
          <Button title="Reset" variant="ghost" onPress={() => onChange(DEFAULT_FILTERS)} />
        </Row>
        <ScrollView contentContainerStyle={{ padding: spacing[4], gap: spacing[5], paddingBottom: 120 }}>
          <Banner tone="positive" icon="shield-checkmark">Only Nexvolt-verified chargers are ever listed.</Banner>
          <Section title="Distance">
            {[2, 5, 10, 25].map((r) => <Chip key={r} label={`${r} km`} selected={value.radiusKm === r} onPress={() => set('radiusKm', r)} />)}
          </Section>
          <Section title="Available">
            {([['any', 'Any time'], ['now', 'Next hour'], ['today-evening', 'Today 6–8 pm'], ['tomorrow-morning', 'Tomorrow 8–10 am']] as const).map(([k, l]) => <Chip key={k} label={l} selected={value.when === k} onPress={() => set('when', k)} />)}
          </Section>
          {value.when !== 'any' && (
            <Section title="For how long">
              {[30, 60, 120].map((m) => <Chip key={m} label={m < 60 ? `${m} min` : `${m / 60} h`} selected={value.durationMinutes === m} onPress={() => set('durationMinutes', m)} />)}
            </Section>
          )}
          {hasVehicle && <Toggle title="Only chargers compatible with my vehicle" value={value.onlyCompatible} onChange={(v) => set('onlyCompatible', v)} />}
          <Section title="Connector">
            <Chip label="Any" selected={!value.connector} onPress={() => set('connector', undefined)} />
            {Object.values(ConnectorType).map((c) => <Chip key={c} label={CONNECTOR_LABELS[c]} selected={value.connector === c} onPress={() => set('connector', c)} />)}
          </Section>
          <Section title="Current">
            {([undefined, 'AC', 'DC'] as const).map((c) => <Chip key={c ?? 'any'} label={c ?? 'Any'} selected={value.currentType === c} onPress={() => set('currentType', c)} />)}
          </Section>
          <Section title="Minimum power">
            {[undefined, 3.3, 7, 22, 50].map((p) => <Chip key={p ?? 0} label={p ? `${p}+ kW` : 'Any'} selected={value.minPowerKw === p} onPress={() => set('minPowerKw', p)} />)}
          </Section>
          <Section title="Max price (per hour or kWh)">
            {[undefined, 100, 150, 250].map((p) => <Chip key={p ?? 0} label={p ? `≤ ₹${p}` : 'Any'} selected={value.maxPriceRupees === p} onPress={() => set('maxPriceRupees', p)} />)}
          </Section>
          <Section title="Parking">
            <Chip label="Any" selected={!value.parkingType} onPress={() => set('parkingType', undefined)} />
            {Object.values(ParkingType).map((p) => <Chip key={p} label={label(p)} selected={value.parkingType === p} onPress={() => set('parkingType', p)} />)}
          </Section>
          <Toggle title="Step-free / wheelchair accessible" value={value.wheelchairAccessible} onChange={(v) => set('wheelchairAccessible', v)} />
          <Toggle title="Verified meter (kWh billing) only" value={value.verifiedMeterOnly} onChange={(v) => set('verifiedMeterOnly', v)} />
        </ScrollView>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing[4], backgroundColor: colors.surface.background, borderTopWidth: 1, borderTopColor: colors.border.default }}>
          <Button title="Show chargers" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
