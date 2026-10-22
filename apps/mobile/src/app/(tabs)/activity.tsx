import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, EmptyState, ErrorState, Row, SkeletonCards, T } from '@/components/ui';
import { api } from '@/lib/api';
import { istDateTime } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

export default function Activity() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.notifications.list(), refetchInterval: 30_000 });
  const readAll = useMutation({ mutationFn: () => api.notifications.readAll(), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface.background }} edges={['top']}>
      <Row style={{ justifyContent: 'space-between', padding: spacing[4] }}>
        <T.Title>Activity</T.Title>
        {!!q.data?.unread && <Button title="Mark all read" variant="ghost" onPress={() => readAll.mutate()} />}
      </Row>
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(n) => n.id}
        refreshing={q.isRefetching}
        onRefresh={() => void q.refetch()}
        contentContainerStyle={{ paddingHorizontal: spacing[4], paddingBottom: spacing[12] }}
        renderItem={({ item: n }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${n.readAt ? '' : 'Unread. '}${n.title}. ${n.body}`}
            onPress={() => {
              if (!n.readAt) void api.notifications.read(n.id).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
              if (n.data?.bookingId) router.push({ pathname: '/booking/[id]', params: { id: n.data.bookingId } });
            }}
            style={{ flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border.default }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 8, backgroundColor: n.readAt ? 'transparent' : colors.brand.accent }} />
            <Ionicons name={n.type === 'SAFETY_ALERT' ? 'warning' : n.type.startsWith('PAY') || n.type.startsWith('REFUND') ? 'card-outline' : 'flash-outline'} size={20} color={n.type === 'SAFETY_ALERT' ? colors.status.danger.fg : colors.brand.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <T.Body style={{ fontWeight: n.readAt ? '400' : '700' }}>{n.title}</T.Body>
              <T.Small>{n.body}</T.Small>
              <T.Tiny>{istDateTime(n.createdAt)}</T.Tiny>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={q.isLoading ? <SkeletonCards /> : q.isError ? <ErrorState error={q.error} /> : <EmptyState icon="notifications-outline" title="Nothing yet" body="Booking, payment and safety updates will appear here." />}
      />
    </SafeAreaView>
  );
}
