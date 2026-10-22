import { minutesToHHMM, hhmmToMinutes } from '@nexvolt/shared';

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const toHHMM = (m: number) => minutesToHHMM(m);
export const fromHHMM = (s: string) => hhmmToMinutes(s);

export function istTime(iso: string) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
export function istDay(iso: string) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
}
export function istDateKey(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}
