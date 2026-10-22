import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { HostBookingCard } from '@/components/host-booking-card';
import { DemoBanner } from '@/components/demo-banner';
import { EmptyState, ErrorState, Screen, SkeletonCards, StatsCard, T } from '@/components/ui';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { spacing } from '@/lib/theme';

export default function HostDashboard() {
  const { user } = useSession();
  const earnings = useQuery({ queryKey: ['host-earnings'], queryFn: () => api.hosts.earnings() });
  const q = useQuery({
    queryKey: ['host-bookings', 'upcoming'],
    queryFn: () => api.bookings.hostQueue('upcoming'),
    refetchInterval: 30_000,
  });
  const active = (q.data ?? []).filter(
    (b) => !['CANCELLED', 'EXPIRED', 'FAILED'].includes(b.status),
  );
  const requests = active.filter((b) => b.status === 'AWAITING_HOST_APPROVAL');
  const live = active.filter((b) => ['CHECKED_IN', 'CHARGING'].includes(b.status));
  const upcoming = active.filter((b) =>
    ['CONFIRMED', 'HELD', 'PENDING_PAYMENT'].includes(b.status),
  );
  return (
    <Screen>
      <T.Title>Hi, {user?.hostProfile?.displayName ?? 'host'}</T.Title>
      <DemoBanner />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
        <StatsCard
          label="Pending"
          value={earnings.data ? money(earnings.data.pendingMinor) : '…'}
          hint="Until dispute window ends"
        />
        <StatsCard
          label="Eligible"
          value={earnings.data ? money(earnings.data.eligibleMinor) : '…'}
          hint="Owed, not yet paid"
        />
      </View>
      {q.isLoading ? (
        <SkeletonCards />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          {requests.length > 0 && <T.H2>Requests ({requests.length})</T.H2>}
          {requests.map((b) => (
            <HostBookingCard key={b.id} b={b} />
          ))}
          {live.length > 0 && <T.H2>In progress</T.H2>}
          {live.map((b) => (
            <HostBookingCard key={b.id} b={b} />
          ))}
          <T.H2>Upcoming</T.H2>
          {upcoming.length ? (
            upcoming.map((b) => <HostBookingCard key={b.id} b={b} />)
          ) : (
            <EmptyState
              icon="calendar-outline"
              title="No upcoming bookings"
              body="Make sure your chargers are verified and published."
            />
          )}
        </>
      )}
    </Screen>
  );
}
