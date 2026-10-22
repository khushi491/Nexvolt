import Constants from 'expo-constants';

/**
 * API base URL. EXPO_PUBLIC_API_URL wins; in development we derive the dev machine's LAN IP
 * from the Expo host so a physical phone can reach the local API (localhost would be the phone).
 */
function devHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  return host ? `http://${host}:4000` : null;
}

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? devHost() ?? 'http://localhost:4000';

/**
 * Rewrite an absolute API URL (e.g. the hosted checkout page) to the origin this device can reach.
 * Uses a regex because React Native's URL implementation has no setters.
 */
export function reachable(url: string): string {
  const origin = /^https?:\/\/[^/]+/i;
  const base = origin.exec(API_URL)?.[0];
  return base ? url.replace(origin, base) : url;
}
