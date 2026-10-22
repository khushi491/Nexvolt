import Ionicons from '@expo/vector-icons/Ionicons';
import { formatIndianPhone } from '@nexvolt/shared';
import { router, type Href } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { Badge, Card, Screen, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, spacing } from '@/lib/theme';

function Item({
  icon,
  title,
  sub,
  href,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub?: string;
  href?: Href;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress ?? (() => href && router.push(href))}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 56,
        paddingVertical: 8,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons
        name={icon}
        size={22}
        color={danger ? colors.status.danger.fg : colors.brand.primary}
      />
      <View style={{ flex: 1 }}>
        <T.Body style={danger ? { color: colors.status.danger.fg } : undefined}>{title}</T.Body>
        {sub && <T.Small>{sub}</T.Small>}
      </View>
      {!danger && <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />}
    </Pressable>
  );
}

export default function Profile() {
  const { user, signOut } = useSession();
  if (!user) return null;
  const isHost = user.roles.includes('HOST');
  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <T.Title>{user.name ?? 'Your profile'}</T.Title>
        <T.Small>{formatIndianPhone(user.phone)}</T.Small>
        {isHost && <Badge tone="info" label="Host" />}
      </View>
      <Card style={{ paddingVertical: 4 }}>
        <Item
          icon="person-outline"
          title="Personal details"
          sub="Name, email, emergency contact"
          href="/profile/edit"
        />
        <Item icon="car-outline" title="My vehicles" href="/vehicles" />
        <Item icon="heart-outline" title="Favourites" href="/favorites" />
        <Item
          icon="notifications-outline"
          title="Notification settings"
          href="/settings/notifications"
        />
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        {isHost ? (
          <Item
            icon="business-outline"
            title="Switch to host mode"
            sub="Bookings, sessions and earnings"
            onPress={() => router.replace('/host')}
          />
        ) : (
          <Item
            icon="flash-outline"
            title="Share your charger"
            sub="Become a host — set up on the web portal"
            onPress={() =>
              Alert.alert(
                'Become a host',
                'Host onboarding (documents, availability and verification) is done on the Nexvolt host portal on a computer.',
              )
            }
          />
        )}
        <Item icon="help-buoy-outline" title="Help & support" href="/support" />
        <Item
          icon="warning-outline"
          title="Report a safety issue"
          href="/support/new?kind=incident"
        />
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <Item
          icon="trash-outline"
          title="Request account deletion"
          danger
          onPress={() =>
            Alert.alert(
              'Delete your account?',
              'We’ll process your request and contact you. Some transaction records may be retained where the law requires.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Request deletion',
                  style: 'destructive',
                  onPress: () =>
                    void api.users
                      .requestDeletion()
                      .then((r) => Alert.alert('Request received', r.note))
                      .catch((e) => Alert.alert('Error', errorMessage(e))),
                },
              ],
            )
          }
        />
        <Item
          icon="log-out-outline"
          title="Sign out"
          danger
          onPress={() => void signOut().then(() => router.replace('/login'))}
        />
      </Card>
      <T.Tiny style={{ textAlign: 'center', marginTop: spacing[2] }}>
        Nexvolt MVP · not production-ready
      </T.Tiny>
    </Screen>
  );
}
