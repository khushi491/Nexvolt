import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Badge, Button, Card, EmptyState, Row, Screen, SkeletonCards, T } from '@/components/ui';
import { api } from '@/lib/api';
import { istDateTime, label } from '@/lib/format';

export default function Support() {
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: () => api.support.tickets() });
  const disputes = useQuery({ queryKey: ['disputes'], queryFn: () => api.support.myDisputes() });
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Help & support' }} />
      <Button
        title="Contact support"
        icon="chatbubble-ellipses-outline"
        onPress={() => router.push('/support/new')}
      />
      <Button
        title="Report a safety issue"
        variant="secondary"
        icon="warning-outline"
        onPress={() => router.push({ pathname: '/support/new', params: { kind: 'incident' } })}
      />
      <T.Small>In an emergency (fire, electric shock, injury) call 112 first.</T.Small>
      <T.H3>Your requests</T.H3>
      {tickets.isLoading ? (
        <SkeletonCards count={2} />
      ) : !tickets.data?.length ? (
        <EmptyState icon="chatbubbles-outline" title="No support requests" />
      ) : (
        tickets.data.map((t) => (
          <Card
            key={t.id}
            onPress={() => router.push({ pathname: '/support/[id]', params: { id: t.id } })}
            accessibilityLabel={t.subject}
            style={{ gap: 4 }}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <T.Body style={{ fontWeight: '600', flex: 1 }}>{t.subject}</T.Body>
              <Badge
                tone={
                  t.status === 'AWAITING_USER'
                    ? 'warning'
                    : t.status === 'RESOLVED' || t.status === 'CLOSED'
                      ? 'positive'
                      : 'info'
                }
                label={label(t.status)}
              />
            </Row>
            <T.Small>
              {t.reference} · {label(t.category)} · {istDateTime(t.updatedAt)}
            </T.Small>
          </Card>
        ))
      )}
      {!!disputes.data?.length && <T.H3>Disputes</T.H3>}
      {disputes.data?.map((d) => (
        <Card
          key={d.id}
          style={{ gap: 4 }}
          onPress={() => router.push({ pathname: '/booking/[id]', params: { id: d.bookingId } })}
        >
          <Row style={{ justifyContent: 'space-between' }}>
            <T.Body style={{ fontWeight: '600' }}>{d.bookingCode}</T.Body>
            <Badge
              tone={d.status.startsWith('RESOLVED') ? 'positive' : 'warning'}
              label={label(d.status)}
            />
          </Row>
          <T.Small>
            {label(d.reason)}
            {d.resolutionNotes ? ` · ${d.resolutionNotes}` : ''}
          </T.Small>
        </Card>
      ))}
    </Screen>
  );
}
