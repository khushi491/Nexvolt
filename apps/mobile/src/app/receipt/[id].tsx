import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Share } from 'react-native';
import { Banner, Button, Card, ErrorState, KeyValue, PriceBreakdown, Screen, SkeletonCards, T } from '@/components/ui';
import { api } from '@/lib/api';
import { istDateTime, istTime, kwh, money } from '@/lib/format';
import { spacing } from '@/lib/theme';

export default function Receipt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['receipt', id], queryFn: () => api.bookings.receipt(id) });
  if (q.isLoading) return <Screen edges={[]}><SkeletonCards /></Screen>;
  if (q.isError || !q.data) return <ErrorState error={q.error} />;
  const r = q.data;
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Receipt' }} />
      {r.isDemoPayment && <Banner tone="demo" icon="flask-outline">DEMO PAYMENT — no real money was charged.</Banner>}
      <Card style={{ gap: spacing[1] }}>
        <T.H2>{money(r.netPaidMinor)}</T.H2>
        <T.Small>Receipt {r.receiptNumber} · booking {r.bookingCode}</T.Small>
        <T.Small>Issued {istDateTime(r.issuedAt)}</T.Small>
      </Card>
      <Card style={{ gap: spacing[1] }}>
        <T.H3>{r.chargerTitle}</T.H3>
        <T.Small>{r.locality}, {r.city} · Host: {r.hostDisplayName}</T.Small>
        <KeyValue k="Slot" v={`${istTime(r.startAt)}–${istTime(r.endAt)}`} />
        <KeyValue k="Actual duration" v={r.actualDurationMinutes != null ? `${r.actualDurationMinutes} min` : '—'} />
        <KeyValue k="Estimated energy" v={`~${kwh(r.estimatedEnergyWh)} (estimate)`} />
        <KeyValue k="Verified energy" v={r.meteredEnergyWh != null ? kwh(r.meteredEnergyWh, 3) : '—'} />
      </Card>
      <Card style={{ gap: spacing[1] }}>
        <PriceBreakdown items={r.lineItems} total={r.paidMinor} />
        {r.refundedMinor > 0 && <KeyValue k="Refunded" v={`−${money(r.refundedMinor)}`} />}
        <KeyValue k="Net paid" v={money(r.netPaidMinor)} />
        {r.paymentMethod && <KeyValue k="Method" v={r.paymentMethod.toUpperCase()} />}
      </Card>
      {r.notes.filter((n) => !(r.isDemoPayment && n.startsWith('DEMO PAYMENT'))).map((n) => <T.Tiny key={n}>• {n}</T.Tiny>)}
      <Button title="Share receipt" variant="secondary" icon="share-outline" onPress={() => void Share.share({ message: `Nexvolt receipt ${r.receiptNumber} for ${r.bookingCode}: ${money(r.netPaidMinor)}${r.isDemoPayment ? ' (DEMO PAYMENT)' : ''}` })} />
    </Screen>
  );
}
