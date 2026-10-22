import { colors, palette, radii, shadows, spacing, touchTarget, typography } from '@nexvolt/ui-tokens';

export { colors, palette, radii, spacing, touchTarget, typography };
export const shadow = shadows.card.native;
export const raised = shadows.raised.native;

export const text = {
  title: { fontSize: typography.size['2xl'], lineHeight: typography.lineHeight['2xl'], fontWeight: '700' as const, color: colors.text.primary },
  h2: { fontSize: typography.size.xl, lineHeight: typography.lineHeight.xl, fontWeight: '700' as const, color: colors.text.primary },
  h3: { fontSize: typography.size.lg, lineHeight: typography.lineHeight.lg, fontWeight: '600' as const, color: colors.text.primary },
  body: { fontSize: typography.size.md, lineHeight: typography.lineHeight.md, color: colors.text.primary },
  small: { fontSize: typography.size.sm, lineHeight: typography.lineHeight.sm, color: colors.text.secondary },
  tiny: { fontSize: typography.size.xs, lineHeight: typography.lineHeight.xs, color: colors.text.secondary },
};
