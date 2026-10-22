/**
 * Money is always handled as integer minor units (paise for INR).
 * Never use floating point for stored or transmitted amounts.
 */
export const CURRENCY = 'INR' as const;
export type Currency = typeof CURRENCY;

/** Basis points: 10000 bps = 100%. */
export const BPS_DENOMINATOR = 10_000;

export function assertMinor(amount: number, label = 'amount'): void {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`${label} must be an integer number of paise, got ${amount}`);
  }
}

/** Multiply a minor amount by basis points, rounding half-up to the nearest paisa. */
export function applyBps(amountMinor: number, bps: number): number {
  assertMinor(amountMinor);
  if (!Number.isInteger(bps) || bps < 0 || bps > BPS_DENOMINATOR) {
    throw new RangeError(`bps must be an integer 0..10000, got ${bps}`);
  }
  // Integer arithmetic; safe for amounts up to ~9e11 paise.
  const product = amountMinor * bps;
  const q = Math.trunc(product / BPS_DENOMINATOR);
  const r = product - q * BPS_DENOMINATOR;
  return Math.abs(r) * 2 >= BPS_DENOMINATOR ? q + Math.sign(product) : q;
}

/** Proportional share: round(amount * numerator / denominator), half-up. */
export function proportion(amountMinor: number, numerator: number, denominator: number): number {
  assertMinor(amountMinor);
  if (denominator <= 0) throw new RangeError('denominator must be positive');
  if (numerator === denominator) return amountMinor;
  return Math.round((amountMinor * numerator) / denominator);
}

/** Convert rupees (as typed by a user, e.g. "149.50") to paise without float drift. */
export function rupeesToPaise(input: string | number): number {
  const s = typeof input === 'number' ? input.toFixed(2) : input.trim();
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new RangeError(`Invalid rupee amount: ${input}`);
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? '').padEnd(2, '0'));
  return whole * 100 + frac;
}

/** Format paise as an INR string using Indian digit grouping, e.g. ₹1,23,456.50 */
export function formatINR(amountMinor: number, opts: { showPaise?: boolean } = {}): string {
  assertMinor(amountMinor);
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  const digits = String(rupees);
  let grouped: string;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = `${rest},${last3}`;
  }
  const showPaise = opts.showPaise ?? paise !== 0;
  const body = showPaise ? `${grouped}.${String(paise).padStart(2, '0')}` : grouped;
  return `${negative ? '-' : ''}₹${body}`;
}
