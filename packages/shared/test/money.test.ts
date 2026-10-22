import { describe, expect, it } from 'vitest';
import { applyBps, formatINR, proportion, rupeesToPaise } from '../src/money';

describe('money', () => {
  it('applies basis points with half-up rounding on integers', () => {
    expect(applyBps(10_000, 1000)).toBe(1000);
    expect(applyBps(15, 1000)).toBe(2); // 1.5 -> 2
    expect(applyBps(14, 1000)).toBe(1); // 1.4 -> 1
    expect(applyBps(0, 1000)).toBe(0);
    expect(() => applyBps(10.5, 1000)).toThrow();
    expect(() => applyBps(100, 10_001)).toThrow();
  });
  it('converts rupee strings without float drift', () => {
    expect(rupeesToPaise('149.5')).toBe(14950);
    expect(rupeesToPaise('0.07')).toBe(7);
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(() => rupeesToPaise('1.234')).toThrow();
  });
  it('formats INR with Indian digit grouping', () => {
    expect(formatINR(12345650)).toBe('₹1,23,456.50');
    expect(formatINR(10000)).toBe('₹100');
    expect(formatINR(-5050)).toBe('-₹50.50');
    expect(formatINR(99)).toBe('₹0.99');
  });
  it('computes proportional shares', () => {
    expect(proportion(1000, 1, 3)).toBe(333);
    expect(proportion(1000, 3, 3)).toBe(1000);
  });
});
