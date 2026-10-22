import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Badge, Button, Card, ErrorState, Field, Screen, SkeletonCards, T } from '@/components/ui';
import { api } from '@/lib/api';
import { istDateTime, label } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function Ticket() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ticket', id], queryFn: () => api.support.ticket(id) });
  const [body, setBody] = useState('');
  const send = useMutation({ mutationFn: () => api.support.message(id, body.trim()), onSuccess: () => { setBody(''); void qc.invalidateQueries({ queryKey: ['ticket', id] }); } });
  if (q.isLoading) return <Screen edges={[]}><SkeletonCards /></Screen>;
  if (q.isError || !q.data) return <ErrorState error={q.error} />;
  const t = q.data;
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: t.reference }} />
      <T.H2>{t.subject}</T.H2>
      <Badge tone="info" label={label(t.status)} />
      <Card><T.Body>{t.description}</T.Body></Card>
      {t.messages?.map((m) => (
        <View key={m.id} style={{ alignSelf: m.authorId === user?.id ? 'flex-end' : 'flex-start', maxWidth: '85%', backgroundColor: m.authorId === user?.id ? colors.status.info.bg : colors.surface.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border.default }}>
          <T.Tiny>{m.authorId === user?.id ? 'You' : 'Nexvolt support'} · {istDateTime(m.createdAt)}</T.Tiny>
          <T.Body>{m.body}</T.Body>
        </View>
      ))}
      {t.status !== 'CLOSED' && (
        <>
          <Field label="Reply" value={body} onChangeText={setBody} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
          <Button title="Send reply" disabled={!body.trim()} loading={send.isPending} onPress={() => send.mutate()} />
        </>
      )}
    </Screen>
  );
}
