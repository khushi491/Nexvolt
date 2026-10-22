import { newIdempotencyKey } from '@nexvolt/api-client';
import { CONNECTOR_LABELS, type ConnectorType } from '@nexvolt/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import {
  Banner,
  BookingStepper,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  KeyValue,
  PriceBreakdown,
  Row,
  Screen,
  SkeletonCards,
  T,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { istDay, istTime } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

export default function Book() {
  const { chargerId, startAt, endAt } = useLocalSearchParams<{
    chargerId: string;
    startAt: string;
    endAt: string;
  }>();
  const qc = useQueryClient();
  // One idempotency key per checkout screen: double taps / retries create a single booking.
  const bookingKey = useRef(newIdempotencyKey()).current;
  const orderKey = useRef(newIdempotencyKey()).current;
  const charger = useQuery({
    queryKey: ['charger', chargerId],
    queryFn: () => api.chargers.get(chargerId),
  });
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: () => api.vehicles.list() });
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [connector, setConnector] = useState<ConnectorType | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const vehicle = vehicles.data?.find(
    (v) =>
      v.id === (vehicleId ?? vehicles.data?.find((x) => x.isDefault)?.id ?? vehicles.data?.[0]?.id),
  );
  const options = (charger.data?.connectors ?? []).filter((k) =>
    vehicle?.connectors.includes(k.connectorType),
  );
  const chosen =
    connector && options.some((o) => o.connectorType === connector)
      ? connector
      : (options[0]?.connectorType ?? null);
  const quote = useQuery({
    queryKey: ['quote', chargerId, vehicle?.id, chosen, startAt, endAt],
    queryFn: () =>
      api.bookings.quote({
        chargerId,
        vehicleId: vehicle!.id,
        connectorType: chosen!,
        startAt,
        endAt,
      }),
    enabled: !!vehicle && !!chosen,
  });

  if (charger.isLoading || vehicles.isLoading)
    return (
      <Screen edges={[]}>
        <SkeletonCards />
      </Screen>
    );
  if (charger.isError) return <ErrorState error={charger.error} />;
  if (!vehicles.data?.length) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="car-outline"
          title="Add your vehicle first"
          body="We need your connector and charging limits to check compatibility and estimate cost."
          action={<Button title="Add vehicle" onPress={() => router.push('/vehicles/new')} />}
        />
      </Screen>
    );
  }
  const c = charger.data!;
  const q = quote.data;
  const manual = c.approvalMode === 'MANUAL';

  const reserve = async () => {
    setBusy(true);
    try {
      const b = await api.bookings.create(
        {
          chargerId,
          vehicleId: vehicle!.id,
          connectorType: chosen!,
          startAt,
          endAt,
          acceptPolicies: true,
        },
        bookingKey,
      );
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      if (b.status === 'AWAITING_HOST_APPROVAL') {
        router.replace({ pathname: '/booking/[id]', params: { id: b.id } });
        return;
      }
      const order = await api.payments.createOrder(b.id, orderKey);
      router.replace({
        pathname: '/pay/[bookingId]',
        params: { bookingId: b.id, url: order.checkoutUrl },
      });
    } catch (e) {
      Alert.alert('Couldn’t reserve this slot', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Book charging' }} />
      <BookingStepper steps={['Details', 'Pay', 'Confirmed']} current={0} />
      <Card style={{ gap: 4 }}>
        <T.H3>{c.title}</T.H3>
        <T.Small>
          {c.locality}, {c.city}
        </T.Small>
        <T.Body style={{ fontWeight: '600' }}>
          {istDay(startAt)} · {istTime(startAt)} – {istTime(endAt)} IST
        </T.Body>
      </Card>
      <View style={{ gap: spacing[2] }}>
        <T.H3>Vehicle</T.H3>
        <Row>
          {vehicles.data.map((v) => (
            <Chip
              key={v.id}
              label={v.nickname ?? `${v.manufacturer} ${v.model}`}
              selected={v.id === vehicle?.id}
              onPress={() => setVehicleId(v.id)}
            />
          ))}
        </Row>
      </View>
      <View style={{ gap: spacing[2] }}>
        <T.H3>Connector</T.H3>
        {options.length ? (
          <Row>
            {options.map((k) => (
              <Chip
                key={k.connectorType}
                label={`${CONNECTOR_LABELS[k.connectorType]} · ${k.powerKw} kW`}
                selected={k.connectorType === chosen}
                onPress={() => setConnector(k.connectorType)}
              />
            ))}
          </Row>
        ) : (
          <Banner tone="danger" icon="close-circle">
            This charger has no connector your vehicle accepts.
          </Banner>
        )}
      </View>
      {quote.isLoading && <SkeletonCards count={1} />}
      {q && !q.valid && (
        <Banner tone="danger" icon="alert-circle">
          {q.rejectionMessage ?? 'This slot can’t be booked.'}
        </Banner>
      )}
      {q?.pricing && (
        <Card style={{ gap: spacing[2] }}>
          <T.H3>Price</T.H3>
          <PriceBreakdown
            items={q.pricing.lineItems}
            total={q.pricing.totalMinor}
            isEstimate={q.pricing.isEstimate}
          />
          <KeyValue
            k="Estimated energy"
            v={`~${(q.pricing.estimatedEnergyWh / 1000).toFixed(1)} kWh (estimate)`}
          />
          {q.pricing.pricingUnit === 'PER_HOUR' && (
            <T.Tiny>
              Hourly bookings are charged for the reserved time, not energy delivered.
            </T.Tiny>
          )}
        </Card>
      )}
      <Card style={{ gap: spacing[2] }}>
        <T.H3>Before you book</T.H3>
        <T.Small>• {c.cancellationPolicyText}</T.Small>
        <T.Small>
          • Use only the host’s charger and cable. Stop immediately and report if anything looks
          unsafe.
        </T.Small>
        <T.Small>
          • You and the host each confirm start and end in the app; meter readings are compared and
          differences go to Nexvolt support.
        </T.Small>
        <T.Small>• The exact address is shared after confirmation, close to your slot.</T.Small>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <Switch
            value={agree}
            onValueChange={setAgree}
            accessibilityLabel="I agree to the cancellation, safety and metering policies"
            trackColor={{ true: colors.brand.primary }}
          />
          <T.Body style={{ flex: 1 }}>I agree to these policies</T.Body>
        </View>
      </Card>
      {manual && (
        <Banner tone="warning" icon="hourglass-outline">
          This host approves requests. You’ll pay only after they accept.
        </Banner>
      )}
      <Button
        title={manual ? 'Send booking request' : 'Reserve & continue to payment'}
        loading={busy}
        disabled={!agree || !q?.valid}
        onPress={reserve}
      />
    </Screen>
  );
}
