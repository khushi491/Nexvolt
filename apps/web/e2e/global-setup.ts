import { mkdirSync, writeFileSync } from 'node:fs';
import { API, API_ADMIN_PHONE, OTP } from './helpers';

/**
 * Checks the stack is in demo mode, then signs in the API-level admin ONCE and stores its
 * access token for the run (OTP cooldowns prevent rapid repeated sign-ins of one phone —
 * by design). The browser tests use a different seeded admin.
 */
export default async function globalSetup() {
  const res = await fetch(`${API}/api/v1/health`).catch(() => null);
  if (!res?.ok) throw new Error(`Nexvolt API is not reachable at ${API}. Start infra and the API first (see README).`);
  const h = (await res.json()) as { demoMode: boolean };
  if (!h.demoMode) throw new Error('E2E tests require the API to run with LOCAL_DEMO_MODE=true (DEMO payments + OTP emulator).');
  const req = await fetch(`${API}/api/v1/auth/otp/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: API_ADMIN_PHONE }) });
  if (!req.ok) throw new Error(`Could not request OTP for the API admin (${req.status}). Wait 30s and retry; run the seed if the account is missing.`);
  const ver = await fetch(`${API}/api/v1/auth/otp/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: API_ADMIN_PHONE, code: OTP }) });
  if (!ver.ok) throw new Error(`API admin sign-in failed (${ver.status}): ${await ver.text()}`);
  const body = (await ver.json()) as { accessToken: string; user: { id: string; roles: string[] } };
  if (!body.user.roles.includes('ADMIN')) throw new Error('API admin account lacks ADMIN role — re-run the seed.');
  mkdirSync('e2e/.auth', { recursive: true });
  writeFileSync('e2e/.auth/api-admin.json', JSON.stringify({ token: body.accessToken, userId: body.user.id }));
}
