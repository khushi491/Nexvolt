import { CONNECTOR_LABELS, ConnectorType, type VehicleCatalogDto } from '@nexvolt/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { Banner, Button, Card, Chip, Field, Row, Screen, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { colors } from '@/lib/theme';

export default function NewVehicle() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const catalog = useQuery({ queryKey: ['catalog', search], queryFn: () => api.vehicles.catalog(search || undefined) });
  const [picked, setPicked] = useState<VehicleCatalogDto | null>(null);
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [nickname, setNickname] = useState('');
  const [connectors, setConnectors] = useState<ConnectorType[]>(['TYPE_2']);
  const [ac, setAc] = useState('7.2');
  const [dc, setDc] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (m: VehicleCatalogDto) => {
    setPicked(m);
    setManufacturer(m.manufacturer);
    setModel(`${m.model}${m.variant ? ` ${m.variant}` : ''}`);
    setConnectors(m.connectors);
    setAc(String(m.maxAcKw));
    setDc(m.maxDcKw ? String(m.maxDcKw) : '');
  };
  const toggle = (c: ConnectorType) => setConnectors((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Add vehicle' }} />
      <Field label="Find your model" value={search} onChangeText={setSearch} placeholder="e.g. Nexon, ZS EV" autoCapitalize="none" />
      {(catalog.data ?? []).slice(0, 8).map((m) => (
        <Pressable key={m.id} accessibilityRole="button" accessibilityState={{ selected: picked?.id === m.id }} onPress={() => pick(m)}>
          <Card style={picked?.id === m.id ? { borderColor: colors.brand.primary, borderWidth: 2 } : undefined}>
            <T.Body style={{ fontWeight: '600' }}>{m.manufacturer} {m.model} {m.variant ?? ''}</T.Body>
            <T.Small>{m.connectors.map((c) => CONNECTOR_LABELS[c]).join(', ')} · AC {m.maxAcKw} kW{m.maxDcKw ? ` · DC ${m.maxDcKw} kW` : ''}</T.Small>
          </Card>
        </Pressable>
      ))}
      <Banner tone="info" icon="information-circle-outline">Catalog specs are indicative. Check your vehicle manual and adjust below if needed.</Banner>
      <Field label="Manufacturer" value={manufacturer} onChangeText={setManufacturer} />
      <Field label="Model" value={model} onChangeText={setModel} />
      <Field label="Nickname (optional)" value={nickname} onChangeText={setNickname} />
      <T.H3>Connectors your vehicle accepts</T.H3>
      <Row>{Object.values(ConnectorType).map((c) => <Chip key={c} label={CONNECTOR_LABELS[c]} selected={connectors.includes(c)} onPress={() => toggle(c)} />)}</Row>
      <Field label="Max AC charging (kW)" value={ac} onChangeText={setAc} keyboardType="decimal-pad" hint="Your onboard charger limit, e.g. 3.3, 7.2 or 11" />
      <Field label="Max DC charging (kW, optional)" value={dc} onChangeText={setDc} keyboardType="decimal-pad" />
      <Button
        title="Save vehicle"
        loading={busy}
        disabled={!manufacturer || !model || !connectors.length || !Number(ac)}
        onPress={async () => {
          setBusy(true);
          try {
            await api.vehicles.create({ catalogModelId: picked?.id, manufacturer: manufacturer.trim(), model: model.trim(), nickname: nickname.trim() || undefined, connectors, maxAcKw: Number(ac), maxDcKw: dc ? Number(dc) : null });
            await qc.invalidateQueries({ queryKey: ['vehicles'] });
            router.back();
          } catch (e) {
            Alert.alert('Could not save', errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Screen>
  );
}
