import { router } from 'expo-router';
import { Badge, Button, Card, KeyValue, Screen, T, VerificationBadge } from '@/components/ui';
import { istDay, label } from '@/lib/format';
import { useSession } from '@/lib/session';

export default function HostProfile() {
  const { user, signOut } = useSession();
  const h = user?.hostProfile;
  if (!h) return null;
  return (
    <Screen>
      <T.Title>{h.displayName}</T.Title>
      <VerificationBadge verified={h.kycStatus === 'VERIFIED'} label="Identity verified" />
      <Card style={{ gap: 2 }}>
        <KeyValue k="Host type" v={label(h.hostType)} />
        <KeyValue k="Identity" v={label(h.kycStatus)} />
        <KeyValue k="Payout account" v={label(h.payoutAccountStatus)} />
        <KeyValue
          k="Rating"
          v={h.ratingCount ? `★ ${h.ratingAvg} (${h.ratingCount})` : 'No reviews yet'}
        />
        <KeyValue k="Hosting since" v={istDay(h.createdAt)} />
      </Card>
      {h.suspendedAt && <Badge tone="danger" label="Host account suspended" />}
      <Button
        title="Switch to driver mode"
        icon="car-outline"
        onPress={() => router.replace('/explore')}
      />
      <Button
        title="Help & support"
        variant="secondary"
        icon="help-buoy-outline"
        onPress={() => router.push('/support')}
      />
      <Button
        title="Sign out"
        variant="ghost"
        onPress={() => void signOut().then(() => router.replace('/login'))}
      />
    </Screen>
  );
}
