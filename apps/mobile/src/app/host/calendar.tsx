import { addMinutes, BOOKING_STATUS_DISPLAY } from '@nexvolt/shared';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { Badge, Card, ErrorState, Screen, SkeletonCards, T } from '@/components/ui';
import { api } from '@/lib/api';
import { istDateKey, istDay, istTime } from '@/lib/format';
import { spacing } from '@/lib/theme';

export default function HostCalendar() {
  const q = useQuery({ queryKey: ['host-bookings', 'calendar'], queryFn: () => api.bookings.hostQueue('upcoming') });
  const chargers = useQuery({ queryKey: ['my-chargers'], queryFn: () => api.chargers.mine() });
  const days = Array.from({ length: 14 }, (_, i) => istDateKey(addMinutes(new Date(), i * 1440)));
  const items = (q.data ?? []).filter((b) => !['CANCELLED', 'EXPIRED', 'FAILED'].includes(b.status));
  return (
    <Screen>
      <T.Title>Calendar</T.Title>
      <T.Small>Next 14 days, all chargers (IST).</T.Small>
      {q.isLoading ? <SkeletonCards /> : q.isError ? <ErrorState error={q.error} /> : days.map((d) => {
        const day = items.filter((b) => istDateKey(new Date(b.startAt)) === d);
        const closed = (chargers.data ?? []).flatMap((c) => c.exceptions.filter((e) => e.date === d).map((e) => `${e.type === 'BLACKOUT' ? 'Closed' : 'Custom hours'} · ${c.title}`));
        return (
          <Card key={d} style={{ gap: 6 }}>
            <T.H3>{istDay(`${d}T12:00:00+05:30`)}</T.H3>
            {closed.map((x) => <T.Small key={x}>{x}</T.Small>)}
            {!day.length && !closed.length && <T.Small>No bookings</T.Small>}
            {day.map((b) => (
              <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' }}>
                <T.Body style={{ fontWeight: '600' }}>{istTime(b.startAt)}–{istTime(b.endAt)}</T.Body>
                <T.Small>{b.charger.title}</T.Small>
                <Badge tone={BOOKING_STATUS_DISPLAY[b.status].tone} label={BOOKING_STATUS_DISPLAY[b.status].label} />
              </View>
            ))}
          </Card>
        );
      })}
    </Screen>
  );
}
