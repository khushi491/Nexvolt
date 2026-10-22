import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, T } from '@/components/ui';
import { colors, spacing } from '@/lib/theme';

const SLIDES: Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = [
  {
    icon: 'flash',
    title: 'Charge in your neighbourhood',
    body: 'Book private chargers shared by verified homeowners, societies and businesses near you.',
  },
  {
    icon: 'shield-checkmark',
    title: 'Verified before listed',
    body: 'Every charger is reviewed by Nexvolt — property permission and electrical safety documents — before it can be booked.',
  },
  {
    icon: 'lock-closed',
    title: 'Your booking, protected',
    body: 'Pay securely in-app. The exact address is shared only after your booking is confirmed, close to your slot.',
  },
];

export default function Onboarding() {
  const [i, setI] = useState(0);
  const s = SLIDES[i]!;
  const last = i === SLIDES.length - 1;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface.navy, padding: spacing[6] }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>
        Nex<Text style={{ color: colors.brand.accent }}>volt</Text>
      </Text>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing[5] }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            backgroundColor: 'rgba(18,184,166,0.15)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={s.icon} size={36} color={colors.brand.accent} />
        </View>
        <T.Title style={{ color: '#fff', fontSize: 30, lineHeight: 36 }}>{s.title}</T.Title>
        <T.Body style={{ color: 'rgba(255,255,255,0.8)' }}>{s.body}</T.Body>
      </View>
      <View
        style={{ flexDirection: 'row', gap: 6, marginBottom: spacing[5] }}
        accessibilityLabel={`Slide ${i + 1} of ${SLIDES.length}`}
      >
        {SLIDES.map((_, j) => (
          <View
            key={j}
            style={{
              height: 6,
              flex: j === i ? 3 : 1,
              borderRadius: 3,
              backgroundColor: j === i ? colors.brand.accent : 'rgba(255,255,255,0.25)',
            }}
          />
        ))}
      </View>
      <Button
        title={last ? 'Get started' : 'Next'}
        onPress={() => (last ? router.replace('/login') : setI(i + 1))}
      />
      {!last && (
        <Button
          title="Skip"
          variant="ghost"
          style={{ marginTop: 8 }}
          onPress={() => router.replace('/login')}
        />
      )}
      <Text
        style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: 12,
          textAlign: 'center',
          marginTop: spacing[3],
        }}
      >
        The Next Way to Charge.
      </Text>
    </SafeAreaView>
  );
}
