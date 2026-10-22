import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Button, Field, Screen, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { colors } from '@/lib/theme';

/** RatingForm: 1–5 stars + optional comment. */
export default function Review() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Rate your session' }} />
      <T.H2>How was charging here?</T.H2>
      <View accessibilityRole="radiogroup" accessibilityLabel="Rating" style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityRole="radio" accessibilityState={{ checked: rating === n }} accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} onPress={() => setRating(n)} hitSlop={6} style={{ padding: 6 }}>
            <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={36} color={n <= rating ? colors.status.warning.solid : colors.text.muted} />
          </Pressable>
        ))}
      </View>
      <Field label="Tell other drivers (optional)" value={comment} onChangeText={setComment} multiline maxLength={1000} style={{ minHeight: 100, textAlignVertical: 'top' }} />
      <T.Tiny>Reviews show your first name only. Please don’t include addresses or phone numbers.</T.Tiny>
      <Button
        title="Submit review"
        disabled={!rating}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await api.reviews.create({ bookingId, rating, comment: comment.trim() || undefined });
            void qc.invalidateQueries({ queryKey: ['booking', bookingId] });
            router.back();
          } catch (e) {
            Alert.alert('Couldn’t submit', errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Screen>
  );
}
