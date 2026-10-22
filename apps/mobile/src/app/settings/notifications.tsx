import type { NotificationPrefs } from '@nexvolt/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { Banner, Card, Screen, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

const ROWS: Array<{ key: keyof NotificationPrefs; title: string; sub: string }> = [
  { key: 'push', title: 'Push notifications', sub: 'Master switch for this device' },
  { key: 'bookings', title: 'Booking updates', sub: 'Confirmations, host requests, arrivals, sessions' },
  { key: 'payments', title: 'Payments & refunds', sub: 'Payment status, refunds and payouts' },
  { key: 'reminders', title: 'Reminders', sub: 'Before your booking starts' },
  { key: 'marketing', title: 'Offers & news', sub: 'Occasional product updates' },
];

export default function NotificationSettings() {
  const { user, reload } = useSession();
  const [prefs, setPrefs] = useState<NotificationPrefs>(user!.notificationPrefs);
  const set = async (k: keyof NotificationPrefs, v: boolean) => {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    await api.users.update({ notificationPrefs: { [k]: v } }).catch(() => setPrefs(prefs));
    void reload();
  };
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <Banner tone="info" icon="shield-checkmark-outline">Safety alerts and verification decisions are always delivered. Every notification also appears in Activity.</Banner>
      <Card>
        {ROWS.map((r) => (
          <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 60, gap: 12 }}>
            <View style={{ flex: 1 }}><T.Body>{r.title}</T.Body><T.Small>{r.sub}</T.Small></View>
            <Switch accessibilityLabel={r.title} value={prefs[r.key]} onValueChange={(v) => void set(r.key, v)} trackColor={{ true: colors.brand.primary }} disabled={r.key !== 'push' && !prefs.push} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
