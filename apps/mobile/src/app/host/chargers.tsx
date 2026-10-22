import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';
import { PromptModal } from '@/components/prompt-modal';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConnectorBadge,
  EmptyState,
  ErrorState,
  Row,
  SampleBadge,
  Screen,
  SkeletonCards,
  T,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { label, money } from '@/lib/format';

export default function HostChargers() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-chargers'], queryFn: () => api.chargers.mine() });
  const [pauseId, setPauseId] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['my-chargers'] }),
    onError: (e) => Alert.alert('Action failed', errorMessage(e)),
  });
  return (
    <Screen>
      <T.Title>Chargers</T.Title>
      <Banner tone="info" icon="desktop-outline">
        Add chargers, edit details, upload documents and set weekly hours on the Nexvolt host
        portal. Pause or publish here anytime.
      </Banner>
      {q.isLoading ? (
        <SkeletonCards />
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : !q.data?.length ? (
        <EmptyState
          icon="flash-outline"
          title="No chargers yet"
          body="Add your first charger on the host portal."
        />
      ) : (
        q.data.map((c) => (
          <Card key={c.id} style={{ gap: 8 }}>
            <T.H3>{c.title}</T.H3>
            <T.Small>
              {c.locality}, {c.city} · {money(c.unitPriceMinor)}{' '}
              {c.pricingUnit === 'PER_HOUR' ? '/h' : '/kWh'}
            </T.Small>
            <Row>
              <Badge
                tone={
                  c.status === 'VERIFIED'
                    ? 'positive'
                    : c.status === 'SUSPENDED' || c.status === 'REJECTED'
                      ? 'danger'
                      : 'warning'
                }
                label={label(c.status)}
              />
              <Badge
                tone={c.isPublished ? 'positive' : 'neutral'}
                label={c.isPublished ? 'Live' : 'Hidden'}
              />
              {c.pausedAt && <Badge tone="warning" label="Paused" />}
              {c.isSample && <SampleBadge />}
            </Row>
            <Row>
              {c.connectors.map((k) => (
                <ConnectorBadge key={k.connectorType} type={k.connectorType} kw={k.powerKw} />
              ))}
            </Row>
            {c.status === 'SUSPENDED' && (
              <Banner tone="danger" icon="ban">
                Suspended by Nexvolt. Contact support before using this charger.
              </Banner>
            )}
            <Row>
              {c.status === 'VERIFIED' && (
                <Button
                  title={c.isPublished ? 'Unpublish' : 'Publish'}
                  variant="secondary"
                  onPress={() =>
                    act.mutate(() =>
                      c.isPublished ? api.chargers.unpublish(c.id) : api.chargers.publish(c.id),
                    )
                  }
                />
              )}
              {c.pausedAt ? (
                <Button
                  title="Resume"
                  variant="secondary"
                  onPress={() => act.mutate(() => api.chargers.resume(c.id))}
                />
              ) : (
                <Button title="Pause" variant="danger" onPress={() => setPauseId(c.id)} />
              )}
            </Row>
          </Card>
        ))
      )}
      <PromptModal
        visible={!!pauseId}
        title="Pause charger"
        message="Hides it from search immediately. Existing bookings are not cancelled — cancel them from your dashboard if you can’t honour them."
        label="Reason (e.g. maintenance, safety concern)"
        confirm="Pause"
        danger
        onCancel={() => setPauseId(null)}
        onSubmit={async (reason) => {
          const id = pauseId!;
          setPauseId(null);
          const r = (await act.mutateAsync(() => api.chargers.pause(id, reason || undefined))) as {
            notice: string | null;
          };
          if (r?.notice) Alert.alert('Paused', r.notice);
        }}
      />
    </Screen>
  );
}
