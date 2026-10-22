import { useState } from 'react';
import { Modal, View } from 'react-native';
import { colors, radii, spacing } from '@/lib/theme';
import { Button, Field, T } from './ui';

/** Cross-platform text prompt (Alert.prompt is iOS-only). */
export function PromptModal({ visible, title, message, label, placeholder, confirm, keyboardType, validate, onCancel, onSubmit, danger }: {
  visible: boolean;
  title: string;
  message?: string;
  label: string;
  placeholder?: string;
  confirm: string;
  keyboardType?: 'default' | 'decimal-pad';
  validate?: (v: string) => string | null;
  onCancel: () => void;
  onSubmit: (v: string) => Promise<unknown> | void;
  danger?: boolean;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const error = value && validate ? validate(value) : null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: colors.surface.overlay, justifyContent: 'center', padding: spacing[5] }}>
        <View accessibilityViewIsModal style={{ backgroundColor: colors.surface.card, borderRadius: radii.lg, padding: spacing[5], gap: spacing[3] }}>
          <T.H2>{title}</T.H2>
          {message && <T.Small>{message}</T.Small>}
          <Field label={label} value={value} onChangeText={setValue} placeholder={placeholder} keyboardType={keyboardType} error={error} autoFocus />
          <View style={{ flexDirection: 'row', gap: spacing[2], justifyContent: 'flex-end' }}>
            <Button title="Cancel" variant="secondary" onPress={() => { setValue(''); onCancel(); }} />
            <Button
              title={confirm}
              variant={danger ? 'danger' : 'primary'}
              loading={busy}
              disabled={!!error}
              onPress={async () => {
                setBusy(true);
                try {
                  await onSubmit(value.trim());
                  setValue('');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
