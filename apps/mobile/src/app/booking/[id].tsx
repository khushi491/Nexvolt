import { newIdempotencyKey } from '@nexvolt/api-client';
import { DisputeReason } from '@nexvolt/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { Alert, Linking, View } from 'react-native';
import { SessionPanel } from '@/components/session-panel';
import { Banner, BookingStatusBadge, BookingStepper, Button, Card, DemoBadge, ErrorState, KeyValue, PriceBreakdown, Row, SampleBadge, Screen, SkeletonCards, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { istDateTime, istDay, istTime, label, money } from '@/lib/format';
import { spacing } from '@/lib/theme';

const STEP: Record<string, number> = { AWAITING_HOST_APPROVAL: 0, HELD: 0, PENDING_PAYMENT: 0, CONFIRMED: 1, CHECKED_IN: 2, CHARGING: 2, COMPLETED: 3, SETTLED: 3 };

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const orderKey = useRef(newIdempotencyKey()).current;
  const q = useQuery({ queryKey: ['booking', id], queryFn: () => api.bookings.get(id), refetchInterval: 15_000 });
  const b = q.data;
  const accessOpen = !!b?.accessAvailableAt && Date.now() >= new Date(b.accessAvailableAt).getTime();
  const access = useQuery({ queryKey: ['access', id], queryFn: () => api.bookings.access(id), enabled: accessOpen, retry: false });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['booking', id] });
    void qc.invalidateQueries({ queryKey: ['bookings'] });
  };
  const checkIn = useMutation({ mutationFn: () => api.bookings.checkIn(id), onSuccess: refresh, onError: (e) => Alert.alert('Couldn’t check in', errorMessage(e)) });

  if (q.isLoading) return <Screen edges={[]}><SkeletonCards /></Screen>;
  if (q.isError || !b) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const pay = async () => {
    try {
      const order = await api.payments.createOrder(b.id, orderKey);
      router.push({ pathname: '/pay/[bookingId]', params: { bookingId: b.id, url: order.checkoutUrl } });
    } catch (e) {
      Alert.alert('Payment unavailable', errorMessage(e));
    }
  };
  const cancel = async () => {
    const preview = await api.bookings.cancellationPreview(b.id).catch(() => null);
    const msg = preview && preview.refundMinor > 0 ? `You’ll be refunded ${money(preview.refundMinor)}${preview.retainedMinor ? ` (${money(preview.retainedMinor)} retained per policy)` : ''}.` : 'No payment has been taken, or none is refundable under the policy.';
    Alert.alert('Cancel booking?', msg, [
      { text: 'Keep booking', style: 'cancel' },
      { text: 'Cancel booking', style: 'destructive', onPress: () => void api.bookings.cancel(b.id, 'Cancelled by driver in app').then(refresh).catch((e) => Alert.alert('Error', errorMessage(e))) },
    ]);
  };
  const dispute = () =>
    Alert.alert('What went wrong?', 'Nexvolt support will review this booking. Payouts to the host are held until resolved.', [
      ...([['NO_ACCESS', 'Couldn’t access the charger'], ['CHARGER_FAULT', 'Charger didn’t work'], ['OVERCHARGE', 'Charged incorrectly']] as const).map(([reason, text]) => ({
        text,
        onPress: () => void api.support.raiseDispute({ bookingId: b.id, reason: reason as DisputeReason, description: `${text} (reported in app)` }).then(refresh).catch((e) => Alert.alert('Error', errorMessage(e))),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  const startMs = new Date(b.startAt).getTime();
  const canCheckIn = b.status === 'CONFIRMED' && Date.now() >= startMs - 15 * 60_000 && Date.now() <= new Date(b.endAt).getTime();

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: b.code }} />
      <Row><BookingStatusBadge status={b.status} />{b.payment?.isDemo && <DemoBadge />}{b.charger.isSample && <SampleBadge />}</Row>
      {STEP[b.status] != null && <BookingStepper steps={['Reserved', 'Confirmed', 'Charging', 'Done']} current={STEP[b.status]!} />}
      <Card style={{ gap: 4 }}>
        <T.H3>{b.charger.title}</T.H3>
        <T.Small>{b.charger.locality}, {b.charger.city}</T.Small>
        <T.Body style={{ fontWeight: '600' }}>{istDay(b.startAt)} · {istTime(b.startAt)} – {istTime(b.endAt)} IST</T.Body>
        <T.Small>{b.vehicle.label} · {label(b.connectorType)}</T.Small>
      </Card>

      {b.status === 'AWAITING_HOST_APPROVAL' && <Banner tone="warning" icon="hourglass-outline">Waiting for the host to accept{b.holdExpiresAt ? ` (until ${istTime(b.holdExpiresAt)})` : ''}. You haven’t been charged.</Banner>}
      {(b.status === 'HELD' || b.status === 'PENDING_PAYMENT') && (
        <>
          <Banner tone="info" icon="time-outline">Slot held until {b.holdExpiresAt ? istTime(b.holdExpiresAt) : 'soon'}. Complete payment to confirm.</Banner>
          <Button title={`Pay ${money(b.pricing.totalMinor)}`} onPress={() => void pay()} />
        </>
      )}
      {b.status === 'EXPIRED' && <Banner tone="neutral" icon="close-circle-outline">This hold expired. You weren’t charged.</Banner>}
      {b.status === 'FAILED' && <Banner tone="danger" icon="close-circle-outline">This booking couldn’t be completed. Any payment taken has been refunded in full.</Banner>}
      {b.status === 'DISPUTED' && <Banner tone="danger" icon="chatbubbles-outline">Under review by Nexvolt support. We’ll notify you when it’s resolved.</Banner>}

      {['CONFIRMED', 'CHECKED_IN', 'CHARGING'].includes(b.status) && (
        <Card style={{ gap: spacing[2] }}>
          <T.H3>Getting there</T.H3>
          {access.data ? (
            <>
              <T.Body>{access.data.address.line1}{access.data.address.line2 ? `, ${access.data.address.line2}` : ''}</T.Body>
              <T.Small>{access.data.address.locality}, {access.data.address.city} {access.data.address.pincode}</T.Small>
              {access.data.accessInstructions && <Banner tone="info" icon="key-outline">{access.data.accessInstructions}</Banner>}
              {access.data.parkingNotes && <T.Small>Parking: {access.data.parkingNotes}</T.Small>}
              <Button title="Navigate with Google Maps" icon="navigate" variant="secondary" onPress={() => void Linking.openURL(access.data!.navigationUrl)} />
            </>
          ) : (
            <T.Small>The exact address and access instructions will appear here from {b.accessAvailableAt ? istDateTime(b.accessAvailableAt) : 'shortly before your slot'}.</T.Small>
          )}
          {b.status === 'CONFIRMED' && (
            <Button title="I’ve arrived — check in" disabled={!canCheckIn} loading={checkIn.isPending} onPress={() => checkIn.mutate()} accessibilityHint="Available from 15 minutes before your slot" />
          )}
          {b.status === 'CONFIRMED' && !canCheckIn && <T.Tiny>Check-in opens 15 minutes before your slot.</T.Tiny>}
        </Card>
      )}

      <SessionPanel b={b} />

      <Card style={{ gap: spacing[2] }}>
        <T.H3>Payment</T.H3>
        <PriceBreakdown items={b.pricing.lineItems} total={b.pricing.totalMinor} isEstimate={b.pricing.isEstimate} />
        {b.payment && <KeyValue k="Status" v={`${label(b.payment.status)}${b.payment.isDemo ? ' (DEMO)' : ''}`} />}
        {b.payment && b.payment.amountRefundedMinor > 0 && <KeyValue k="Refunded" v={money(b.payment.amountRefundedMinor)} />}
      </Card>

      <View style={{ gap: spacing[2] }}>
        {b.payment && ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(b.payment.status) && <Button title="View receipt" variant="secondary" icon="receipt-outline" onPress={() => router.push({ pathname: '/receipt/[id]', params: { id: b.id } })} />}
        {['COMPLETED', 'SETTLED'].includes(b.status) && !b.hasReview && <Button title="Rate your experience" icon="star-outline" onPress={() => router.push({ pathname: '/review/[bookingId]', params: { bookingId: b.id } })} />}
        {b.canCancel && <Button title="Cancel booking" variant="ghost" onPress={() => void cancel()} />}
        {['CONFIRMED', 'CHECKED_IN', 'CHARGING', 'COMPLETED', 'NO_SHOW'].includes(b.status) && !b.hasOpenDispute && <Button title="Report a problem with this booking" variant="ghost" onPress={dispute} />}
        <Button title="Contact support" variant="ghost" icon="help-buoy-outline" onPress={() => router.push({ pathname: '/support/new', params: { bookingId: b.id } })} />
        <Button title="Report a safety issue" variant="ghost" icon="warning-outline" onPress={() => router.push({ pathname: '/support/new', params: { bookingId: b.id, kind: 'incident' } })} />
      </View>
      {b.cancelReason && <T.Tiny>Cancelled: {b.cancelReason}</T.Tiny>}
    </Screen>
  );
}
