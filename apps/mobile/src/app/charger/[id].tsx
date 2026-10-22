import Ionicons from '@expo/vector-icons/Ionicons';
import { CONNECTOR_LABELS } from '@nexvolt/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AvailabilityPicker, type SlotChoice } from '@/components/availability-picker';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConnectorBadge,
  ErrorState,
  KeyValue,
  Row,
  SampleBadge,
  SkeletonCards,
  T,
  VerificationBadge,
} from '@/components/ui';
import { api } from '@/lib/api';
import { istDateKey, istDay, label, money } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

export default function ChargerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['charger', id], queryFn: () => api.chargers.get(id) });
  const reviews = useQuery({ queryKey: ['reviews', id], queryFn: () => api.chargers.reviews(id) });
  const [date, setDate] = useState(istDateKey(new Date()));
  const [duration, setDuration] = useState(60);
  const [slot, setSlot] = useState<SlotChoice | null>(null);
  const fav = useMutation({
    mutationFn: () => (q.data?.isFavorite ? api.favorites.remove(id) : api.favorites.add(id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['charger', id] });
      void qc.invalidateQueries({ queryKey: ['favorites'] });
    },
  });

  if (q.isLoading)
    return (
      <View style={{ padding: spacing[4] }}>
        <SkeletonCards />
      </View>
    );
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const c = q.data;
  const unit = c.pricingUnit === 'PER_HOUR' ? 'per hour' : 'per kWh';
  const compat = c.compatibility;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.background }}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={c.isFavorite ? 'Remove from favourites' : 'Save to favourites'}
              onPress={() => fav.mutate()}
              hitSlop={12}
            >
              <Ionicons
                name={c.isFavorite ? 'heart' : 'heart-outline'}
                size={24}
                color={c.isFavorite ? colors.status.danger.solid : colors.text.primary}
              />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {c.photos.length ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {c.photos.map((p) => (
              <Image
                key={p.id}
                source={{ uri: p.url }}
                style={{ width: 360, height: 220 }}
                contentFit="cover"
                accessibilityLabel="Charger photo"
              />
            ))}
          </ScrollView>
        ) : (
          <View
            style={{
              height: 160,
              backgroundColor: colors.surface.navy,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="flash" size={48} color={colors.brand.accent} />
          </View>
        )}
        <View style={{ padding: spacing[4], gap: spacing[4] }}>
          <View style={{ gap: spacing[2] }}>
            <Row>
              <VerificationBadge verified label="Nexvolt verified" />
              {c.host.identityVerified && (
                <Badge tone="positive" icon="person" label="ID-verified host" />
              )}
              {c.isSample && <SampleBadge />}
            </Row>
            <T.Title>{c.title}</T.Title>
            <T.Small>
              {c.locality}, {c.city} ·{' '}
              {c.ratingCount ? `★ ${c.ratingAvg} (${c.ratingCount} reviews)` : 'No reviews yet'}
            </T.Small>
            <T.H2>
              {money(c.unitPriceMinor)} <T.Small>{unit}</T.Small>
            </T.H2>
          </View>
          {c.isPaused && (
            <Banner tone="warning" icon="pause-circle">
              The host has paused this charger. It can’t be booked right now.
            </Banner>
          )}
          {compat &&
            (compat.compatible ? (
              <Banner tone="positive" icon="checkmark-circle">
                Works with your vehicle via {CONNECTOR_LABELS[compat.bestConnector!]} at up to{' '}
                {compat.effectiveKw} kW.
              </Banner>
            ) : (
              <Banner tone="danger" icon="close-circle">
                Not compatible with your default vehicle (
                {compat.reason === 'NO_COMMON_CONNECTOR'
                  ? 'no matching connector'
                  : 'current type not supported'}
                ).
              </Banner>
            ))}
          <Card style={{ gap: 6 }}>
            <T.H3>Charger</T.H3>
            <Row>
              {c.connectors.map((k) => (
                <ConnectorBadge key={k.connectorType} type={k.connectorType} kw={k.powerKw} />
              ))}
            </Row>
            <KeyValue k="Type / max power" v={`${c.currentType} · ${c.maxPowerKw} kW`} />
            {c.chargerMake && <KeyValue k="Model" v={`${c.chargerMake} ${c.chargerModel ?? ''}`} />}
            <KeyValue
              k="Metering"
              v={c.verifiedMeter ? 'Verified sub-meter' : label(c.meterType)}
            />
            <KeyValue
              k="Booking"
              v={c.approvalMode === 'MANUAL' ? 'Host approves requests' : 'Instant confirmation'}
            />
            <T.Tiny>
              Nexvolt can’t start, stop or monitor this charger remotely. You and the host confirm
              the session and meter readings in the app.
            </T.Tiny>
          </Card>
          <Card style={{ gap: 6 }}>
            <T.H3>Location & parking</T.H3>
            <T.Small>
              Approximate area: {c.locality}, {c.city}. The exact address and access instructions
              are shared after your booking is confirmed, close to your slot.
            </T.Small>
            <KeyValue k="Parking" v={label(c.parkingType)} />
            {c.wheelchairAccessible && <KeyValue k="Accessibility" v="Step-free" />}
            {c.parkingNotes && <T.Body>{c.parkingNotes}</T.Body>}
          </Card>
          {c.safetyNotes && (
            <Banner tone="warning" icon="warning-outline">
              {c.safetyNotes}
            </Banner>
          )}
          <Card style={{ gap: 6 }}>
            <T.H3>Cancellation</T.H3>
            <T.Small>{c.cancellationPolicyText}</T.Small>
          </Card>
          {!c.isPaused && (
            <Card>
              <AvailabilityPicker
                chargerId={c.id}
                minDuration={c.minDurationMinutes}
                maxDuration={c.maxDurationMinutes}
                date={date}
                setDate={(d) => {
                  setDate(d);
                  setSlot(null);
                }}
                duration={duration}
                setDuration={(m) => {
                  setDuration(m);
                  setSlot(null);
                }}
                value={slot}
                onChange={setSlot}
              />
            </Card>
          )}
          <Card style={{ gap: spacing[2] }}>
            <T.H3>Host</T.H3>
            <T.Body>
              {c.host.displayName} · {label(c.host.hostType)}
            </T.Body>
            <T.Small>Hosting since {istDay(c.host.memberSince)}</T.Small>
          </Card>
          <View style={{ gap: spacing[2] }}>
            <T.H3>Reviews</T.H3>
            {!reviews.data?.length ? (
              <T.Small>No reviews yet.</T.Small>
            ) : (
              reviews.data.slice(0, 5).map((r) => (
                <Card key={r.id} style={{ gap: 4 }}>
                  <T.Body style={{ fontWeight: '600' }}>
                    {'★'.repeat(r.rating)}
                    {'☆'.repeat(5 - r.rating)} · {r.authorName}
                  </T.Body>
                  {r.comment && <T.Body>{r.comment}</T.Body>}
                  {r.hostReply && <T.Small>Host: {r.hostReply}</T.Small>}
                </Card>
              ))
            )}
          </View>
        </View>
      </ScrollView>
      {!c.isPaused && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: spacing[4],
            paddingBottom: spacing[6],
            backgroundColor: colors.surface.card,
            borderTopWidth: 1,
            borderTopColor: colors.border.default,
          }}
        >
          <Button
            title={slot ? 'Continue to book' : 'Choose a time to book'}
            disabled={!slot || (compat ? !compat.compatible : false)}
            onPress={() =>
              router.push({
                pathname: '/book/[chargerId]',
                params: { chargerId: c.id, startAt: slot!.startAt, endAt: slot!.endAt },
              })
            }
          />
        </View>
      )}
    </View>
  );
}
