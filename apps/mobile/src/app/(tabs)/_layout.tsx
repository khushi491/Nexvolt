import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { registerForPush } from '@/lib/push';
import type { ColorValue } from 'react-native';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

const icon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} size={size} color={color as string} />
  );

export default function TabsLayout() {
  const { status } = useSession();
  useEffect(() => {
    if (status === 'authenticated') void registerForPush();
  }, [status]);
  if (status === 'anonymous') return <Redirect href="/login" />;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand.primary,
        tabBarInactiveTintColor: colors.text.muted,
        headerShown: false,
        tabBarStyle: { minHeight: 60 },
      }}
    >
      <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: icon('map-outline') }} />
      <Tabs.Screen
        name="bookings"
        options={{ title: 'Bookings', tabBarIcon: icon('calendar-outline') }}
      />
      <Tabs.Screen
        name="activity"
        options={{ title: 'Activity', tabBarIcon: icon('notifications-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: icon('person-circle-outline') }}
      />
    </Tabs>
  );
}
