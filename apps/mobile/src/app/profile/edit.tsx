import { normalizeIndianPhone } from '@nexvolt/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Field, Screen, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function EditProfile() {
  const { user, reload } = useSession();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [ecName, setEcName] = useState(user?.emergencyContactName ?? '');
  const [ecPhone, setEcPhone] = useState(user?.emergencyContactPhone?.replace('+91', '') ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Personal details' }} />
      <Field
        label="Full name"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
      />
      <Field
        label="Email (optional)"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <T.H3>Emergency contact (optional)</T.H3>
      <T.Small>
        Shared with Nexvolt support only if there’s a safety incident during a booking.
      </T.Small>
      <Field label="Contact name" value={ecName} onChangeText={setEcName} />
      <Field
        label="Contact mobile"
        value={ecPhone}
        onChangeText={setEcPhone}
        keyboardType="phone-pad"
        error={err}
      />
      <Button
        title="Save"
        loading={busy}
        onPress={async () => {
          setErr(null);
          const phone = ecPhone ? normalizeIndianPhone(ecPhone) : null;
          if (ecPhone && !phone) return setErr('Enter a valid Indian mobile number');
          setBusy(true);
          try {
            await api.users.update({
              name: name.trim() || undefined,
              email: email.trim() || null,
              emergencyContactName: ecName.trim() || null,
              emergencyContactPhone: phone,
            });
            await reload();
            router.back();
          } catch (e) {
            Alert.alert('Could not save', errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Screen>
  );
}
