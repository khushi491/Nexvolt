import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Alert } from 'react-native';
import { Badge, Button, Card, ConnectorBadge, EmptyState, ErrorState, Row, Screen, SkeletonCards, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export default function Vehicles() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['vehicles'], queryFn: () => api.vehicles.list() });
  const refresh = () => qc.invalidateQueries({ queryKey: ['vehicles'] });
  const makeDefault = useMutation({ mutationFn: (id: string) => api.vehicles.update(id, { isDefault: true }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api.vehicles.remove(id), onSuccess: refresh, onError: (e) => Alert.alert('Error', errorMessage(e)) });
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'My vehicles' }} />
      {q.isLoading ? <SkeletonCards /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.length ? (
        <EmptyState icon="car-outline" title="No vehicles yet" body="Add your EV so we only show chargers it can use." />
      ) : q.data.map((v) => (
        <Card key={v.id} style={{ gap: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T.H3>{v.nickname ?? `${v.manufacturer} ${v.model}`}</T.H3>
            {v.isDefault && <Badge tone="positive" label="Default" />}
          </Row>
          <T.Small>{v.manufacturer} {v.model} · AC up to {v.maxAcKw} kW{v.maxDcKw ? ` · DC up to ${v.maxDcKw} kW` : ''}</T.Small>
          <Row>{v.connectors.map((c) => <ConnectorBadge key={c} type={c} />)}</Row>
          <Row>
            {!v.isDefault && <Button title="Make default" variant="secondary" onPress={() => makeDefault.mutate(v.id)} />}
            <Button title="Remove" variant="ghost" onPress={() => Alert.alert('Remove vehicle?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(v.id) }])} />
          </Row>
        </Card>
      ))}
      <Button title="Add vehicle" icon="add" onPress={() => router.push('/vehicles/new')} />
    </Screen>
  );
}
