import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { Badge, Banner, Card, ErrorState, KeyValue, Row, Screen, SkeletonCards, StatsCard, T } from '@/components/ui';
import { api } from '@/lib/api';
import { istDay, label, money } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

export default function HostEarnings() {
  const s = useQuery({ queryKey: ['host-earnings'], queryFn: () => api.hosts.earnings() });
  const ledger = useQuery({ queryKey: ['host-ledger'], queryFn: () => api.hosts.ledger(100) });
  const payouts = useQuery({ queryKey: ['host-payouts'], queryFn: () => api.hosts.payouts() });
  const e = s.data;
  return (
    <Screen>
      <T.Title>Earnings</T.Title>
      {s.isLoading ? <SkeletonCards count={1} /> : s.isError || !e ? <ErrorState error={s.error} /> : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
            <StatsCard label="Pending" value={money(e.pendingMinor)} hint="Session + dispute window" />
            <StatsCard label="Eligible" value={money(e.eligibleMinor)} hint="Owed — not transferred yet" />
            <StatsCard label="In payout" value={money(e.inPayoutMinor)} hint="Awaiting bank confirmation" />
            <StatsCard label="Paid out" value={money(e.paidOutMinor)} hint="Confirmed with bank reference" />
          </View>
          <Card style={{ gap: 2 }}>
            <KeyValue k="Gross charging fees" v={money(e.grossMinor)} />
            <KeyValue k="Nexvolt commission" v={money(e.commissionMinor)} />
            <KeyValue k="Payment fees" v={money(e.paymentFeesMinor)} />
            <KeyValue k="Refunds" v={money(e.refundsMinor)} />
            <KeyValue k="Payout account" v={label(e.payoutAccountStatus)} />
          </Card>
          {e.payoutAccountStatus !== 'ACTIVE' && <Banner tone="warning" icon="card-outline">Payouts need a verified bank account. Request setup from the host portal; Nexvolt verifies it through a secure channel.</Banner>}
        </>
      )}
      <T.H2>Payouts</T.H2>
      {!payouts.data?.length ? <T.Small>No payouts yet.</T.Small> : payouts.data.map((p) => (
        <Card key={p.id}>
          <Row style={{ justifyContent: 'space-between' }}><T.Body style={{ fontWeight: '700' }}>{money(p.amountMinor)}</T.Body><Badge tone={p.status === 'PAID' ? 'positive' : p.status === 'FAILED' ? 'danger' : 'warning'} label={label(p.status)} /></Row>
          <T.Small>{istDay(p.createdAt)}{p.externalReference ? ` · Ref ${p.externalReference}` : ''}</T.Small>
        </Card>
      ))}
      <T.H2>Ledger</T.H2>
      {ledger.isLoading ? <SkeletonCards count={2} /> : (ledger.data ?? []).map((l) => (
        <View key={l.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border.default }}>
          <View style={{ flex: 1 }}><T.Body>{label(l.type)}</T.Body><T.Tiny>{l.bookingCode ?? ''} · {label(l.status)} · {istDay(l.createdAt)}</T.Tiny></View>
          <T.Body style={{ fontWeight: '700', color: l.amountMinor < 0 ? colors.status.danger.fg : colors.status.positive.fg }}>{money(l.amountMinor)}</T.Body>
        </View>
      ))}
    </Screen>
  );
}
