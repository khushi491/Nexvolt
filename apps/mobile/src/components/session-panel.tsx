import type { BookingDto } from '@nexvolt/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { kwh, label } from '@/lib/format';
import { spacing } from '@/lib/theme';
import { Badge, Banner, Button, Card, Field, KeyValue, Row, T } from './ui';

/**
 * Manual metering session. Nexvolt never claims live telemetry: estimated energy is labelled
 * as an estimate and "verified" energy appears only after both parties' readings agree.
 */
export function SessionPanel({ b }: { b: BookingDto }) {
  const qc = useQueryClient();
  const s = b.session;
  const [reading, setReading] = useState('');
  const kwhRequired = b.pricing.pricingUnit === 'PER_KWH';
  const act = useMutation({
    mutationFn: (phase: 'start' | 'end') => (phase === 'start' ? api.sessions.start : api.sessions.end)(b.id, reading ? { readingKwh: reading } : {}),
    onSuccess: () => {
      setReading('');
      void qc.invalidateQueries({ queryKey: ['booking', b.id] });
    },
    onError: (e) => Alert.alert('Couldn’t confirm', errorMessage(e)),
  });
  if (!s) return null;
  const phase: 'start' | 'end' | null = b.status === 'CHECKED_IN' || (b.status === 'CHARGING' && !s.driverStartConfirmedAt) ? 'start' : b.status === 'CHARGING' && !s.driverEndConfirmedAt ? 'end' : null;
  const valid = !reading || /^\d{1,9}(\.\d{1,3})?$/.test(reading);
  return (
    <Card style={{ gap: spacing[2] }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T.H3>Charging session</T.H3>
        <Badge tone={s.status === 'CONFIRMED' ? 'positive' : s.status === 'DISPUTED' ? 'danger' : 'info'} label={label(s.status)} />
      </Row>
      <Banner tone="info" icon="information-circle-outline">Plug in and operate the charger as the host instructs. Nexvolt can’t control or monitor it remotely.</Banner>
      <KeyValue k="Started" v={s.startedAt ? new Date(s.startedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }) : '—'} />
      <KeyValue k="Duration" v={s.durationMinutes != null ? `${s.durationMinutes} min` : '—'} />
      <KeyValue k="Estimated energy" v={`~${kwh(s.estimatedEnergyWh)} (estimate)`} />
      <KeyValue k="Verified energy" v={s.meteredEnergyWh != null ? kwh(s.meteredEnergyWh, 3) : 'After both readings agree'} />
      <KeyValue k="Host confirmed" v={s.hostEndConfirmedAt ? 'End' : s.hostStartConfirmedAt ? 'Start' : 'Not yet'} />
      {s.readings.length > 0 && <T.Tiny>Readings: {s.readings.map((r) => `${label(r.phase)} (${label(r.recordedByRole)}) ${r.readingKwh}`).join(' · ')}</T.Tiny>}
      {s.assessment && s.assessment.status !== 'AGREED' && <Banner tone={s.status === 'DISPUTED' ? 'danger' : 'warning'} icon="alert-circle">{s.assessment.message}</Banner>}
      {phase && (
        <View style={{ gap: spacing[2] }}>
          <Field label={`Meter reading at ${phase} (kWh)${kwhRequired ? '' : ' — optional'}`} value={reading} onChangeText={setReading} keyboardType="decimal-pad" error={valid ? null : 'Use a number with up to 3 decimals'} hint="Read it off the charger or sub-meter display" />
          <Button title={phase === 'start' ? 'Confirm charging started' : 'Confirm charging finished'} loading={act.isPending} disabled={!valid || (kwhRequired && !reading)} onPress={() => act.mutate(phase)} />
        </View>
      )}
      {b.status === 'CHARGING' && s.driverEndConfirmedAt && !s.hostEndConfirmedAt && <T.Small>Waiting for the host to confirm the end of the session.</T.Small>}
    </Card>
  );
}
