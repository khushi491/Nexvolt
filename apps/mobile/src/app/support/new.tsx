import { IncidentType, Priority, TicketCategory } from '@nexvolt/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Banner, Button, Chip, Field, Row, Screen, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { label } from '@/lib/format';

export default function NewRequest() {
  const { bookingId, kind } = useLocalSearchParams<{ bookingId?: string; kind?: string }>();
  const incident = kind === 'incident';
  const qc = useQueryClient();
  const [category, setCategory] = useState<TicketCategory>(bookingId ? 'BOOKING' : 'OTHER');
  const [type, setType] = useState<IncidentType>('ELECTRICAL_HAZARD');
  const [severity, setSeverity] = useState<Priority>('HIGH');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      if (incident) {
        const r = await api.support.reportIncident({ type, severity, description: description.trim(), bookingId });
        Alert.alert('Report received', r.chargerAutoSuspended ? 'The charger has been suspended while Nexvolt investigates. Please don’t use it.' : 'Nexvolt’s safety team has been alerted and will follow up.');
      } else {
        await api.support.createTicket({ category, subject: subject.trim(), description: description.trim(), bookingId });
        void qc.invalidateQueries({ queryKey: ['tickets'] });
      }
      router.back();
    } catch (e) {
      Alert.alert('Couldn’t send', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: incident ? 'Report a safety issue' : 'Contact support' }} />
      {incident ? (
        <>
          <Banner tone="danger" icon="warning">If anyone is in danger — fire, smoke, electric shock or injury — move away and call 112 now. Then report it here.</Banner>
          <T.H3>What happened?</T.H3>
          <Row>{Object.values(IncidentType).map((t) => <Chip key={t} label={label(t)} selected={type === t} onPress={() => setType(t)} />)}</Row>
          <T.H3>How serious?</T.H3>
          <Row>{(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Priority[]).map((p) => <Chip key={p} label={label(p)} selected={severity === p} onPress={() => setSeverity(p)} />)}</Row>
          {severity === 'CRITICAL' && <T.Small>Critical reports immediately suspend the charger until Nexvolt reviews it.</T.Small>}
        </>
      ) : (
        <>
          <T.H3>Topic</T.H3>
          <Row>{Object.values(TicketCategory).map((c) => <Chip key={c} label={label(c)} selected={category === c} onPress={() => setCategory(c)} />)}</Row>
          <Field label="Subject" value={subject} onChangeText={setSubject} maxLength={120} />
        </>
      )}
      <Field label="Details" value={description} onChangeText={setDescription} multiline maxLength={4000} style={{ minHeight: 120, textAlignVertical: 'top' }} hint="At least 10 characters" />
      {bookingId && <T.Tiny>Linked to your booking.</T.Tiny>}
      <Button title={incident ? 'Send safety report' : 'Send'} variant={incident ? 'danger' : 'primary'} loading={busy} disabled={description.trim().length < 10 || (!incident && subject.trim().length < 4)} onPress={() => void submit()} />
    </Screen>
  );
}
