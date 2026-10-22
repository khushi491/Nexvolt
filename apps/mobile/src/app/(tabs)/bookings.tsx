import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BookingStatusBadge,
  Button,
  Card,
  Chip,
  DemoBadge,
  EmptyState,
  ErrorState,
  Row,
  SkeletonCards,
  T,
} from '@/components/ui';
import { api } from '@/lib/api';
import { istDay, istTime, money } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

export default function Bookings() {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const q = useQuery({ queryKey: ['bookings', scope], queryFn: () => api.bookings.list(scope) });
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface.background }} edges={['top']}>
      <View style={{ padding: spacing[4], gap: spacing[3] }}>
        <T.Title>Bookings</T.Title>
        <Row>
          <Chip
            label="Upcoming"
            selected={scope === 'upcoming'}
            onPress={() => setScope('upcoming')}
          />
          <Chip label="Past" selected={scope === 'past'} onPress={() => setScope('past')} />
        </Row>
      </View>
      <FlatList
        data={q.data ?? []}
        keyExtractor={(b) => b.id}
        refreshing={q.isRefetching}
        onRefresh={() => void q.refetch()}
        contentContainerStyle={{
          padding: spacing[4],
          paddingTop: 0,
          gap: spacing[3],
          paddingBottom: spacing[12],
        }}
        renderItem={({ item: b }) => (
          <Card
            onPress={() => router.push({ pathname: '/booking/[id]', params: { id: b.id } })}
            accessibilityLabel={`${b.charger.title}, ${istDay(b.startAt)}`}
            style={{ gap: 6 }}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <BookingStatusBadge status={b.status} />
              {b.payment?.isDemo && <DemoBadge />}
            </Row>
            <T.H3>{b.charger.title}</T.H3>
            <T.Small>
              {istDay(b.startAt)} · {istTime(b.startAt)}–{istTime(b.endAt)} · {b.charger.locality}
            </T.Small>
            <T.Small>
              {b.code} · {money(b.pricing.totalMinor)}
            </T.Small>
          </Card>
        )}
        ListEmptyComponent={
          q.isLoading ? (
            <SkeletonCards />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : (
            <EmptyState
              icon="calendar-outline"
              title={scope === 'upcoming' ? 'No upcoming bookings' : 'No past bookings'}
              body="Find a verified charger nearby and book a slot."
              action={<Button title="Explore chargers" onPress={() => router.push('/explore')} />}
            />
          )
        }
      />
    </SafeAreaView>
  );
}
