'use client';
import { ApiError, NexvoltApi, type TokenStore } from '@nexvolt/api-client';
import type { UserDto } from '@nexvolt/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let accessToken: string | null = null;
type Listener = (user: UserDto | null) => void;
const listeners = new Set<Listener>();

export function onSessionChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(user: UserDto | null) {
  listeners.forEach((l) => l(user));
}

/** Refresh via the same-origin route that holds the httpOnly refresh cookie. */
export async function refreshSession(): Promise<{ accessToken: string; user: UserDto } | null> {
  const res = await fetch('/api/session/refresh', { method: 'POST', credentials: 'same-origin' });
  if (!res.ok) {
    accessToken = null;
    return null;
  }
  const body = (await res.json()) as { accessToken: string; user: UserDto };
  accessToken = body.accessToken;
  return body;
}

const tokens: TokenStore = {
  getAccessToken: () => accessToken,
  getRefreshToken: () => null,
  setTokens: (a) => {
    accessToken = a.accessToken;
  },
  clear: () => {
    accessToken = null;
  },
};

export const api = new NexvoltApi({
  baseUrl: API_URL,
  tokens,
  refresh: async () => (await refreshSession())?.accessToken ?? null,
  onSessionExpired: () => emit(null),
});

export async function login(input: { phone: string; code: string; acceptTerms?: boolean; termsVersion?: string }): Promise<UserDto> {
  const res = await fetch('/api/session/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), credentials: 'same-origin' });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body);
  accessToken = body.accessToken;
  emit(body.user);
  return body.user as UserDto;
}

export async function logout(): Promise<void> {
  await fetch('/api/session/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
  accessToken = null;
  emit(null);
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Something went wrong. Please try again.';
}
