import { useQuery } from '@tanstack/react-query';
import { addMinutes } from '@nexvolt/shared';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { istDateKey, istDay, istTime } from '@/lib/format';
import { spacing } from '@/lib/theme';
import { Chip, EmptyState, Row, SkeletonCards, T } from './ui';

export interface SlotChoice {
  startAt: string;
  endAt: string;
}

/** Day + duration + start-time picker backed by the server's availability (IST). */
export function AvailabilityPicker({ chargerId, minDuration, maxDuration, date, setDate, duration, setDuration, value, onChange }: {
  chargerId: string;
  minDuration: number;
  maxDuration: number;
  date: string;
  setDate: (d: string) => void;
  duration: number;
  setDuration: (m: number) => void;
  value: SlotChoice | null;
  onChange: (s: SlotChoice) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => istDateKey(addMinutes(new Date(), i * 1440)));
  const durations = [30, 60, 90, 120, 180, 240].filter((m) => m >= minDuration && m <= maxDuration);
  const q = useQuery({ queryKey: ['availability', chargerId, date, duration], queryFn: () => api.chargers.availability(chargerId, date, duration) });
  return (
    <View style={{ gap: spacing[3] }}>
      <T.H3>When</T.H3>
      <Row>
        {days.map((d, i) => <Chip key={d} label={i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : istDay(`${d}T12:00:00+05:30`)} selected={d === date} onPress={() => setDate(d)} />)}
      </Row>
      <T.H3>Duration</T.H3>
      <Row>{durations.map((m) => <Chip key={m} label={m < 60 ? `${m} min` : `${m / 60} h`} selected={m === duration} onPress={() => setDuration(m)} />)}</Row>
      <T.H3>Start time (IST)</T.H3>
      {q.isLoading ? <SkeletonCards count={1} /> : !q.data?.slots.length ? (
        <EmptyState icon="time-outline" title="No free slots" body="Try another day or a shorter duration." />
      ) : (
        <Row>
          {q.data.slots.map((s) => (
            <Chip key={s.startAt} label={istTime(s.startAt)} selected={value?.startAt === s.startAt} onPress={() => onChange({ startAt: s.startAt, endAt: s.endAt })} />
          ))}
        </Row>
      )}
    </View>
  );
}
