import Ionicons from '@expo/vector-icons/Ionicons';
import { BOOKING_STATUS_DISPLAY, CONNECTOR_LABELS, type BookingStatus, type ConnectorType, type LineItem } from '@nexvolt/shared';
import type { Tone } from '@nexvolt/ui-tokens';
import { Component, useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorMessage } from '@/lib/api';
import { money } from '@/lib/format';
import { colors, radii, shadow, spacing, text, touchTarget } from '@/lib/theme';

export const T = {
  Title: ({ children, style }: { children: ReactNode; style?: object }) => <Text accessibilityRole="header" style={[text.title, style]}>{children}</Text>,
  H2: ({ children, style }: { children: ReactNode; style?: object }) => <Text accessibilityRole="header" style={[text.h2, style]}>{children}</Text>,
  H3: ({ children, style }: { children: ReactNode; style?: object }) => <Text style={[text.h3, style]}>{children}</Text>,
  Body: ({ children, style, numberOfLines }: { children: ReactNode; style?: object; numberOfLines?: number }) => <Text numberOfLines={numberOfLines} style={[text.body, style]}>{children}</Text>,
  Small: ({ children, style, numberOfLines }: { children: ReactNode; style?: object; numberOfLines?: number }) => <Text numberOfLines={numberOfLines} style={[text.small, style]}>{children}</Text>,
  Tiny: ({ children, style }: { children: ReactNode; style?: object }) => <Text style={[text.tiny, style]}>{children}</Text>,
};

export function Screen({ children, scroll = true, padded = true, edges = ['top'] }: { children: ReactNode; scroll?: boolean; padded?: boolean; edges?: Array<'top' | 'bottom'> }) {
  const inner = padded ? { padding: spacing[4], gap: spacing[4] } : undefined;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface.background }} edges={edges}>
      {scroll ? <ScrollView contentContainerStyle={[inner, { paddingBottom: spacing[12] }]} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[{ flex: 1 }, inner]}>{children}</View>}
    </SafeAreaView>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style, accessibilityHint }: {
  title: string;
  onPress?: PressableProps['onPress'];
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const bg = { primary: colors.brand.primary, secondary: colors.surface.card, ghost: 'transparent', danger: colors.status.danger.fg }[variant];
  const fg = variant === 'secondary' || variant === 'ghost' ? colors.text.primary : colors.text.inverse;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityHint={accessibilityHint}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.border.strong },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: 16 }}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  const body = <View style={[styles.card, style]}>{children}</View>;
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>{body}</Pressable>
  ) : body;
}

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: Tone | 'demo'; icon?: keyof typeof Ionicons.glyphMap }) {
  const c = tone === 'demo' ? { fg: colors.demo.fg, bg: colors.demo.bg } : colors.status[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }, tone === 'demo' && { borderWidth: 1, borderColor: colors.demo.border }]}>
      {icon && <Ionicons name={icon} size={12} color={c.fg} />}
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export const BookingStatusBadge = ({ status }: { status: BookingStatus }) => <Badge label={BOOKING_STATUS_DISPLAY[status].label} tone={BOOKING_STATUS_DISPLAY[status].tone} />;
export const ConnectorBadge = ({ type, kw }: { type: ConnectorType; kw?: number }) => <Badge tone="info" label={`${CONNECTOR_LABELS[type]}${kw ? ` · ${kw} kW` : ''}`} />;
export const SampleBadge = () => <Badge tone="demo" label="SAMPLE" />;
export const DemoBadge = () => <Badge tone="demo" label="DEMO PAYMENT" />;
export const VerificationBadge = ({ verified, label = 'Verified' }: { verified: boolean; label?: string }) =>
  verified ? <Badge tone="positive" icon="shield-checkmark" label={label} /> : <Badge tone="warning" icon="alert-circle" label="Not verified" />;

export function Field({ label, error, hint, ...props }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontWeight: '600', color: colors.text.primary }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.text.muted}
        style={[styles.input, error ? { borderColor: colors.status.danger.solid } : null]}
        {...props}
      />
      {error ? <Text accessibilityRole="alert" style={{ color: colors.status.danger.fg, fontSize: 13 }}>{error}</Text> : hint ? <T.Tiny>{hint}</T.Tiny> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.surface.navy, borderColor: colors.surface.navy }]}
    >
      <Text style={{ color: selected ? colors.text.inverse : colors.text.primary, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Skeleton({ height = 16, width = '100%' as const, style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no" style={[{ height, width, borderRadius: radii.sm, backgroundColor: '#E3E8F0', opacity: v }, style]} />;
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <View accessibilityLabel="Loading" style={{ gap: spacing[3] }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, { gap: 10 }]}>
          <Skeleton height={20} width="60%" />
          <Skeleton height={14} width="40%" />
          <Skeleton height={14} width="80%" />
        </View>
      ))}
    </View>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, body, action }: { icon?: keyof typeof Ionicons.glyphMap; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: spacing[8], gap: spacing[3] }}>
      <View style={{ backgroundColor: colors.status.info.bg, borderRadius: 999, padding: 14 }}>
        <Ionicons name={icon} size={26} color={colors.brand.primary} />
      </View>
      <T.H3 style={{ textAlign: 'center' }}>{title}</T.H3>
      {body && <T.Small style={{ textAlign: 'center' }}>{body}</T.Small>}
      {action}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={{ alignItems: 'center', padding: spacing[8], gap: spacing[3] }}>
      <Ionicons name="warning-outline" size={28} color={colors.status.danger.fg} />
      <T.H3>Couldn’t load this</T.H3>
      <T.Small style={{ textAlign: 'center' }}>{errorMessage(error)}</T.Small>
      {onRetry && <Button title="Try again" variant="secondary" onPress={onRetry} />}
    </View>
  );
}

export function Banner({ tone = 'info', children, icon }: { tone?: Tone | 'demo'; children: ReactNode; icon?: keyof typeof Ionicons.glyphMap }) {
  const c = tone === 'demo' ? { fg: colors.demo.fg, bg: colors.demo.bg } : colors.status[tone];
  return (
    <View accessibilityRole="text" style={{ flexDirection: 'row', gap: 8, backgroundColor: c.bg, borderRadius: radii.md, padding: spacing[3], alignItems: 'flex-start' }}>
      {icon && <Ionicons name={icon} size={18} color={c.fg} style={{ marginTop: 1 }} />}
      <Text style={{ color: c.fg, flex: 1, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function KeyValue({ k, v }: { k: string; v: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 }}>
      <T.Small>{k}</T.Small>
      {typeof v === 'string' || typeof v === 'number' ? <T.Body style={{ fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{v}</T.Body> : v}
    </View>
  );
}

export function PriceBreakdown({ items, total, isEstimate }: { items: LineItem[]; total: number; isEstimate?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      {items.map((i) => <KeyValue key={i.code} k={i.label} v={money(i.amountMinor)} />)}
      <View style={{ height: 1, backgroundColor: colors.border.default, marginVertical: 4 }} />
      <KeyValue k={isEstimate ? 'Total (prepaid estimate)' : 'Total'} v={money(total)} />
      {isEstimate && <T.Tiny>Billed on verified meter readings after the session. Unused prepayment is refunded automatically.</T.Tiny>}
    </View>
  );
}

export function StatsCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={[styles.card, { flex: 1, minWidth: 140, gap: 4 }]}>
      <T.Tiny style={{ textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.5 }}>{label}</T.Tiny>
      <T.H2>{value}</T.H2>
      {hint && <T.Tiny>{hint}</T.Tiny>}
    </View>
  );
}

/** Shows booking progress as a horizontal step indicator. */
export function BookingStepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current]}`} style={{ flexDirection: 'row', gap: 6 }}>
      {steps.map((s, i) => (
        <View key={s} style={{ flex: 1, gap: 4 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= current ? colors.brand.primary : colors.border.default }} />
          <T.Tiny style={{ fontWeight: i === current ? '700' : '400', color: i === current ? colors.text.primary : colors.text.muted }}>{s}</T.Tiny>
        </View>
      ))}
    </View>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: spacing[6], backgroundColor: colors.surface.background }}>
          <ErrorState error={this.state.error} onRetry={() => this.setState({ error: null })} />
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export const styles = StyleSheet.create({
  button: { minHeight: touchTarget, borderRadius: radii.md, paddingHorizontal: spacing[4], flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  card: { backgroundColor: colors.surface.card, borderRadius: radii.lg, padding: spacing[4], borderWidth: 1, borderColor: colors.border.default, ...shadow },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  input: { minHeight: touchTarget, borderWidth: 1, borderColor: colors.border.strong, borderRadius: radii.md, paddingHorizontal: spacing[3], fontSize: 16, color: colors.text.primary, backgroundColor: colors.surface.card },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border.strong, backgroundColor: colors.surface.card, justifyContent: 'center' },
});

export { money };
