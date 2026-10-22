import { ApiError, NexvoltApi, type TokenStore } from '@nexvolt/api-client';
import type { AuthResponse, UserDto } from '@nexvolt/shared';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_URL } from './config';

const RT_KEY = 'nexvolt.refreshToken';
let accessToken: string | null = null;
type Listener = (user: UserDto | null) => void;
const listeners = new Set<Listener>();
export const onSessionChange = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** Refresh token lives in the OS keychain/keystore (SecureStore); access token only in memory. */
const secure = {
  get: async () => (Platform.OS === 'web' ? null : SecureStore.getItemAsync(RT_KEY)),
  set: async (v: string) =>
    Platform.OS === 'web' ? undefined : SecureStore.setItemAsync(RT_KEY, v),
  clear: async () => (Platform.OS === 'web' ? undefined : SecureStore.deleteItemAsync(RT_KEY)),
};

const tokens: TokenStore = {
  getAccessToken: () => accessToken,
  getRefreshToken: () => secure.get(),
  setTokens: async (a: AuthResponse) => {
    accessToken = a.accessToken;
    await secure.set(a.refreshToken);
  },
  clear: async () => {
    accessToken = null;
    await secure.clear();
  },
};

export const api = new NexvoltApi({
  baseUrl: API_URL,
  tokens,
  onSessionExpired: () => listeners.forEach((l) => l(null)),
});

export async function restoreSession(): Promise<UserDto | null> {
  const rt = await secure.get();
  if (!rt) return null;
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) {
      await tokens.clear();
      return null;
    }
    const auth = (await res.json()) as AuthResponse;
    await tokens.setTokens(auth);
    return auth.user;
  } catch {
    return null; // offline: stay signed out until the network returns
  }
}

export async function signIn(input: {
  phone: string;
  code: string;
  acceptTerms?: boolean;
  termsVersion?: string;
}): Promise<UserDto> {
  const auth = await api.auth.verifyOtp(input);
  await tokens.setTokens(auth);
  listeners.forEach((l) => l(auth.user));
  return auth.user;
}

export async function signOut(): Promise<void> {
  const rt = await secure.get();
  if (rt) await api.auth.logout(rt).catch(() => undefined);
  await tokens.clear();
  listeners.forEach((l) => l(null));
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof TypeError) return 'Can’t reach Nexvolt. Check your connection and try again.';
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong. Please try again.';
}
