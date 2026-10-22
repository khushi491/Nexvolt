import { formatINR } from '@nexvolt/shared';

export const money = (minor: number) => formatINR(minor, { showPaise: minor % 100 !== 0 });
export const kwh = (wh: number, dp = 1) => `${(wh / 1000).toFixed(dp)} kWh`;
export const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

const fmt = (opts: Intl.DateTimeFormatOptions) => (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...opts }).format(new Date(iso));
export const istDay = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
export const istTime = fmt({ hour: 'numeric', minute: '2-digit' });
export const istDateTime = fmt({
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
export const istDateKey = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
