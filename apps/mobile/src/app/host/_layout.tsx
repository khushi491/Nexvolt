import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

const icon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} size={size} color={color as string} />
  );

/** Host mode: Dashboard, Chargers, Calendar, Earnings, Profile. Requires the HOST role (enforced server-side too). */
export default function HostLayout() {
  const { status, user } = useSession();
  if (status === 'anonymous') return <Redirect href="/login" />;
  if (user && !user.roles.includes('HOST')) return <Redirect href="/profile" />;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand.primary,
        tabBarInactiveTintColor: colors.text.muted,
        headerShown: false,
        tabBarStyle: { minHeight: 60 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', tabBarIcon: icon('grid-outline') }}
      />
      <Tabs.Screen
        name="chargers"
        options={{ title: 'Chargers', tabBarIcon: icon('flash-outline') }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', tabBarIcon: icon('calendar-outline') }}
      />
      <Tabs.Screen
        name="earnings"
        options={{ title: 'Earnings', tabBarIcon: icon('wallet-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: icon('person-circle-outline') }}
      />
    </Tabs>
  );
}
