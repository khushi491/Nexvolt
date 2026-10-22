/**
 * Nexvolt design tokens. Brand palette from the product spec, plus accessible derivatives:
 * the brand teal (#12B8A6) is used for accents, icons and large graphics; text and filled
 * buttons with white labels use `tealStrong`, which meets WCAG AA (≥ 4.5:1) on white.
 */
export const palette = {
  navy: '#101F35',
  navy800: '#1B2E4A',
  navy700: '#2A4163',
  teal: '#12B8A6',
  tealStrong: '#0B7A6E',
  tealSoft: '#E3F7F4',
  background: '#F7F9FC',
  white: '#FFFFFF',
  slate: '#66758C',
  slateStrong: '#55637A',
  border: '#E3E8F0',
  borderStrong: '#C9D2DF',
  positive: '#16A36A',
  positiveStrong: '#0F7A4F',
  positiveSoft: '#E5F6EE',
  warning: '#E6A23C',
  warningStrong: '#8A5A00',
  warningSoft: '#FDF3E3',
  danger: '#DC4C57',
  dangerStrong: '#B3303B',
  dangerSoft: '#FCEBEC',
  demo: '#8A5A00',
  demoSoft: '#FFF4E0',
} as const;

export const colors = {
  brand: { primary: palette.tealStrong, accent: palette.teal, navy: palette.navy },
  text: { primary: palette.navy, secondary: palette.slateStrong, muted: palette.slate, inverse: palette.white, link: palette.tealStrong },
  surface: { background: palette.background, card: palette.white, sunken: '#EEF2F7', navy: palette.navy, overlay: 'rgba(16,31,53,0.48)' },
  border: { default: palette.border, strong: palette.borderStrong, focus: palette.teal },
  status: {
    positive: { fg: palette.positiveStrong, bg: palette.positiveSoft, solid: palette.positive },
    warning: { fg: palette.warningStrong, bg: palette.warningSoft, solid: palette.warning },
    danger: { fg: palette.dangerStrong, bg: palette.dangerSoft, solid: palette.danger },
    info: { fg: palette.tealStrong, bg: palette.tealSoft, solid: palette.teal },
    neutral: { fg: palette.slateStrong, bg: '#EEF2F7', solid: palette.slate },
  },
  demo: { fg: palette.demo, bg: palette.demoSoft, border: palette.warning },
} as const;

export type Tone = keyof typeof colors.status;

/** 4-pt spacing scale. */
export const spacing = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const typography = {
  fontFamily: 'Inter',
  fontFamilyFallback: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  size: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28, '3xl': 34 },
  lineHeight: { xs: 16, sm: 20, md: 24, lg: 26, xl: 30, '2xl': 36, '3xl': 42 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
} as const;

export const shadows = {
  card: { css: '0 1px 2px rgba(16,31,53,0.06), 0 4px 16px rgba(16,31,53,0.06)', native: { shadowColor: '#101F35', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 } },
  raised: { css: '0 8px 32px rgba(16,31,53,0.12)', native: { shadowColor: '#101F35', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 } },
} as const;

/** Minimum touch target (iOS HIG 44pt / Material 48dp). */
export const touchTarget = 48;

export const tokens = { palette, colors, spacing, radii, typography, shadows, touchTarget } as const;

// ── Contrast utilities (used by tests and runtime assertions in dev) ──
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Invalid hex colour ${hex}`);
  const n = parseInt(m[1]!, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
