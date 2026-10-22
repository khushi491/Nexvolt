import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function Gate() {
  const { status } = useSession();
  if (status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface.navy,
        }}
      >
        <ActivityIndicator color={colors.brand.accent} accessibilityLabel="Loading Nexvolt" />
      </View>
    );
  }
  return <Redirect href={status === 'authenticated' ? '/explore' : '/onboarding'} />;
}
