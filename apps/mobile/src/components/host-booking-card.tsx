import type { BookingDto } from '@nexvolt/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { istDay, istTime, kwh, money } from '@/lib/format';
import { spacing } from '@/lib/theme';
import { PromptModal } from './prompt-modal';
import { Banner, BookingStatusBadge, Button, Card, DemoBadge, Row, SampleBadge, T } from './ui';

type Prompt = null | 'decline' | 'cancel' | 'start' | 'end';
const KWH = /^\d{1,9}(\.\d{1,3})?$/;

/** Host-side booking card with every action the host can take on the phone. */
export function HostBookingCard({ b }: { b: BookingDto }) {
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState<Prompt>(null);
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setPrompt(null);
      void qc.invalidateQueries({ queryKey: ['host-bookings'] });
      void qc.invalidateQueries({ queryKey: ['host-earnings'] });
    },
    onError: (e) => Alert.alert('Action failed', errorMessage(e)),
  });
  const s = b.session;
  const now = Date.now();
  const start = new Date(b.startAt).getTime();
  const kwhRequired = b.pricing.pricingUnit === 'PER_KWH';

  return (
    <Card style={{ gap: spacing[2] }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row><BookingStatusBadge status={b.status} />{b.payment?.isDemo && <DemoBadge />}{b.charger.isSample && <SampleBadge />}</Row>
        <T.Small>{b.code}</T.Small>
      </Row>
      <T.H3>{istDay(b.startAt)} · {istTime(b.startAt)}–{istTime(b.endAt)}</T.H3>
      <T.Small>{b.charger.title}</T.Small>
      <T.Small>{b.driver?.name ?? 'Driver'} · {b.driver?.phoneMasked} · {b.vehicle.label}</T.Small>
      {b.hostView && <T.Small>Your share: {money(b.hostView.hostEarningsBeforeGatewayFeesMinor)} (after {b.hostView.commissionBps / 100}% commission, before gateway fees)</T.Small>}
      {s?.meteredEnergyWh != null && <T.Small>Verified energy: {kwh(s.meteredEnergyWh, 3)}</T.Small>}
      {s?.assessment && s.assessment.status !== 'AGREED' && <Banner tone="warning" icon="alert-circle">{s.assessment.message}</Banner>}
      <View style={{ gap: spacing[2] }}>
        {b.status === 'AWAITING_HOST_APPROVAL' && (
          <Row>
            <Button title="Approve" loading={act.isPending} onPress={() => act.mutate(() => api.bookings.approve(b.id))} style={{ flex: 1 }} />
            <Button title="Decline" variant="secondary" onPress={() => setPrompt('decline')} style={{ flex: 1 }} />
          </Row>
        )}
        {b.status === 'CONFIRMED' && now >= start - 15 * 60_000 && <Button title="Check in driver" onPress={() => act.mutate(() => api.bookings.checkIn(b.id))} />}
        {b.status === 'CONFIRMED' && now >= start + 30 * 60_000 && <Button title="Mark no-show" variant="secondary" onPress={() => Alert.alert('Mark as no-show?', 'The driver can dispute this.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Mark no-show', style: 'destructive', onPress: () => act.mutate(() => api.bookings.noShow(b.id)) }])} />}
        {(b.status === 'CHECKED_IN' || b.status === 'CHARGING') && s && !s.hostStartConfirmedAt && <Button title="Confirm session start" onPress={() => setPrompt('start')} />}
        {b.status === 'CHARGING' && s?.hostStartConfirmedAt && !s.hostEndConfirmedAt && <Button title="Confirm session end" onPress={() => setPrompt('end')} />}
        {b.status === 'CHARGING' && s?.hostEndConfirmedAt && !s.driverEndConfirmedAt && <T.Small>Waiting for the driver to confirm the end.</T.Small>}
        {b.canCancel && b.status !== 'AWAITING_HOST_APPROVAL' && <Button title="Cancel booking (full refund to driver)" variant="ghost" onPress={() => setPrompt('cancel')} />}
      </View>
      <PromptModal
        visible={prompt === 'decline' || prompt === 'cancel'}
        title={prompt === 'decline' ? 'Decline request' : 'Cancel booking'}
        message={prompt === 'cancel' ? 'The driver gets a full refund. Frequent host cancellations may affect your listing.' : 'The driver is not charged.'}
        label="Reason (shared with the driver)"
        confirm={prompt === 'decline' ? 'Decline' : 'Cancel booking'}
        danger
        validate={(v) => (v.trim().length < 3 ? 'Add a short reason' : null)}
        onCancel={() => setPrompt(null)}
        onSubmit={(reason) => act.mutateAsync(() => (prompt === 'decline' ? api.bookings.decline(b.id, reason) : api.bookings.cancel(b.id, reason)))}
      />
      <PromptModal
        visible={prompt === 'start' || prompt === 'end'}
        title={prompt === 'start' ? 'Confirm session start' : 'Confirm session end'}
        message="Enter the reading shown on the meter. The driver records theirs separately; differences go to Nexvolt support."
        label={`Meter reading (kWh)${kwhRequired ? '' : ' — optional, leave blank to skip'}`}
        keyboardType="decimal-pad"
        confirm="Confirm"
        validate={(v) => (v && !KWH.test(v) ? 'Use a number with up to 3 decimals' : null)}
        onCancel={() => setPrompt(null)}
        onSubmit={(v) => {
          if (kwhRequired && !v) {
            Alert.alert('Reading required', 'Per-kWh bookings need a meter reading.');
            return;
          }
          return act.mutateAsync(() => (prompt === 'start' ? api.sessions.start : api.sessions.end)(b.id, v ? { readingKwh: v } : {}));
        }}
      />
    </Card>
  );
}
