import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Banner, BookingStepper, Button, Screen, T } from '@/components/ui';
import { api } from '@/lib/api';
import { reachable } from '@/lib/config';
import { colors, spacing } from '@/lib/theme';

/**
 * Hosted checkout (Razorpay or DEMO) in a WebView. The page reports the outcome via
 * postMessage, but the app always re-reads the booking from the API — the server decides.
 */
export default function Pay() {
  const { bookingId, url } = useLocalSearchParams<{ bookingId: string; url: string }>();
  const qc = useQueryClient();
  const [done, setDone] = useState(false);
  const booking = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => api.bookings.get(bookingId),
    refetchInterval: Platform.OS === 'web' && !done ? 3000 : false,
  });
  const checkout = reachable(url);

  const finish = () => {
    setDone(true);
    void qc.invalidateQueries({ queryKey: ['bookings'] });
    void qc.invalidateQueries({ queryKey: ['booking', bookingId] });
    router.replace({ pathname: '/booking/[id]', params: { id: bookingId } });
  };

  useEffect(() => {
    if (booking.data?.status === 'CONFIRMED') finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.data?.status]);

  if (Platform.OS === 'web') {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Payment' }} />
        <BookingStepper steps={['Details', 'Pay', 'Confirmed']} current={1} />
        <Banner tone="info" icon="lock-closed-outline">
          Checkout opens in a new tab. Return here after paying — this page updates automatically.
        </Banner>
        <Button title="Open secure checkout" onPress={() => void Linking.openURL(checkout)} />
        <Button title="I’ve finished — view booking" variant="secondary" onPress={finish} />
      </Screen>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.background }}>
      <Stack.Screen options={{ title: 'Payment' }} />
      <View style={{ padding: spacing[4] }}>
        <BookingStepper steps={['Details', 'Pay', 'Confirmed']} current={1} />
      </View>
      <WebView
        source={{ uri: checkout }}
        startInLoadingState
        renderLoading={() => (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand.primary} />
        )}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as { type?: string };
            if (msg.type === 'nexvolt-payment') setTimeout(finish, 800);
          } catch {
            /* ignore unrelated messages */
          }
        }}
        originWhitelist={['https://*', 'http://*']}
        setSupportMultipleWindows={false}
      />
      <View style={{ padding: spacing[4] }}>
        <T.Tiny style={{ textAlign: 'center' }}>
          Having trouble? Close this screen — your slot stays held until the payment window ends.
        </T.Tiny>
      </View>
    </View>
  );
}
