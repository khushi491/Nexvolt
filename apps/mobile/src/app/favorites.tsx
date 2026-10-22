import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Badge, Card, EmptyState, ErrorState, Row, Screen, SkeletonCards, T } from '@/components/ui';
import { api } from '@/lib/api';
import { money } from '@/lib/format';

export default function Favorites() {
  const q = useQuery({ queryKey: ['favorites'], queryFn: () => api.favorites.list() });
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Favourites' }} />
      {q.isLoading ? <SkeletonCards /> : q.isError ? <ErrorState error={q.error} /> : !q.data?.length ? (
        <EmptyState icon="heart-outline" title="No favourites yet" body="Tap the heart on a charger to save it here." />
      ) : q.data.map((c) => (
        <Card key={c.id} onPress={() => router.push({ pathname: '/charger/[id]', params: { id: c.id } })} accessibilityLabel={c.title} style={{ gap: 4 }}>
          <T.H3>{c.title}</T.H3>
          <T.Small>{c.locality}, {c.city} · {money(c.unitPriceMinor)} {c.pricingUnit === 'PER_HOUR' ? '/h' : '/kWh'}</T.Small>
          <Row>{c.isPaused && <Badge tone="warning" label="Paused" />}{c.isSample && <Badge tone="demo" label="SAMPLE" />}</Row>
        </Card>
      ))}
    </Screen>
  );
}
