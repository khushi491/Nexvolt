import { describe, expect, it } from 'vitest';
import { colors, contrastRatio, palette } from '../src';

const AA = 4.5;

describe('accessible colour pairs (WCAG 2.1 AA, normal text)', () => {
  const pairs: Array<[string, string, string]> = [
    ['primary text on background', colors.text.primary, colors.surface.background],
    ['secondary text on card', colors.text.secondary, colors.surface.card],
    ['link on card', colors.text.link, colors.surface.card],
    ['white on primary button', colors.text.inverse, colors.brand.primary],
    ['white on navy', colors.text.inverse, colors.surface.navy],
    ...(Object.entries(colors.status).map(([k, v]) => [`${k} badge`, v.fg, v.bg]) as Array<
      [string, string, string]
    >),
    ['demo banner', colors.demo.fg, colors.demo.bg],
  ];
  it.each(pairs)('%s ≥ 4.5:1', (_n, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
  });

  it('documents why brand teal is not used for white-on-teal text', () => {
    expect(contrastRatio(palette.white, palette.teal)).toBeLessThan(AA);
  });

  it('keeps the Tailwind preset in sync with tokens', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const preset = require('../tailwind-preset.js');
    const c = preset.theme.extend.colors;
    expect(c.teal.strong).toBe(palette.tealStrong);
    expect(c.navy.DEFAULT).toBe(palette.navy);
    expect(c.danger.strong).toBe(palette.dangerStrong);
  });
});
