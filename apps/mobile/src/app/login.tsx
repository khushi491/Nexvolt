import { ApiError } from '@nexvolt/api-client';
import { normalizeIndianPhone } from '@nexvolt/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, Switch, Text, View } from 'react-native';
import { Banner, Button, Field, Screen, T } from '@/components/ui';
import { api, errorMessage, signIn } from '@/lib/api';
import { colors, spacing } from '@/lib/theme';

const TERMS_VERSION = '2026-10-v1';

export default function Login() {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [emulator, setEmulator] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const e164 = normalizeIndianPhone(phone);

  const send = async () => {
    setError(null);
    if (!e164) return setError('Enter a valid 10-digit Indian mobile number');
    setBusy(true);
    try {
      const r = await api.auth.requestOtp(e164);
      setEmulator(r.deliveryChannel === 'emulator');
      setStep('code');
    } catch (x) {
      setError(errorMessage(x));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn({ phone: e164!, code, ...(needsConsent ? { acceptTerms: consent, termsVersion: TERMS_VERSION } : {}) });
      router.replace('/explore');
    } catch (x) {
      if (x instanceof ApiError && x.code === 'CONSENT_REQUIRED') setNeedsConsent(true);
      else setError(errorMessage(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ marginTop: spacing[8], gap: spacing[2] }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text.primary }}>Nex<Text style={{ color: colors.brand.primary }}>volt</Text></Text>
          <T.Title>{step === 'phone' ? 'Sign in with your mobile' : 'Enter your code'}</T.Title>
          <T.Small>{step === 'phone' ? 'We’ll send a 6-digit code by SMS.' : `Sent to +91 ${phone}. It expires in 5 minutes.`}</T.Small>
        </View>
        {step === 'phone' ? (
          <>
            <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="98765 43210" error={error} hint="Indian numbers only (+91)" maxLength={14} />
            <Button title="Send code" onPress={send} loading={busy} />
          </>
        ) : (
          <>
            {emulator && <Banner tone="demo" icon="flask-outline">Local OTP emulator — no SMS was sent. Use the code from the API log or the configured demo code.</Banner>}
            <Field label="6-digit code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6} error={error} autoFocus />
            {needsConsent && (
              <View style={{ gap: spacing[2], backgroundColor: colors.status.info.bg, padding: spacing[3], borderRadius: 12 }}>
                <T.H3>Welcome to Nexvolt!</T.H3>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Switch value={consent} onValueChange={setConsent} accessibilityLabel="I agree to the Terms and Privacy Notice" trackColor={{ true: colors.brand.primary }} />
                  <T.Small style={{ flex: 1, color: colors.text.primary }}>I agree to the Terms of Service and Privacy Notice (draft v{TERMS_VERSION}) and consent to processing of my data to provide the service.</T.Small>
                </View>
                <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://example.com/nexvolt-terms-draft')}>
                  <T.Small style={{ color: colors.text.link, textDecorationLine: 'underline' }}>Read the draft terms</T.Small>
                </Pressable>
              </View>
            )}
            <Button title={needsConsent ? 'Accept & create account' : 'Verify & continue'} onPress={verify} loading={busy} disabled={code.length !== 6 || (needsConsent && !consent)} />
            <Button title="Use a different number" variant="ghost" onPress={() => { setStep('phone'); setCode(''); setError(null); setNeedsConsent(false); }} />
          </>
        )}
        <T.Tiny style={{ textAlign: 'center' }}>Never share your code with anyone, including Nexvolt staff.</T.Tiny>
      </Screen>
    </KeyboardAvoidingView>
  );
}
