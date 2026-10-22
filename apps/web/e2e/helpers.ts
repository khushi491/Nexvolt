import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
export const OTP = process.env.E2E_OTP_CODE ?? '123456';
/** Seeded admin used in the browser. */
export const ADMIN_PHONE = '9000000001';
/** Second seeded admin used for API-level setup (signed in once in global setup). */
export const API_ADMIN_PHONE = '9000000004';

export function apiAdmin(request: APIRequestContext): ApiUser {
  const { token, userId } = JSON.parse(readFileSync('e2e/.auth/api-admin.json', 'utf8')) as { token: string; userId: string };
  return new ApiUser(request, token, userId);
}

let seq = 0;
export function freshPhone(): string {
  seq++;
  return `96${String(Date.now()).slice(-6)}${String(seq).padStart(2, '0')}`;
}

/** Driver-side actions go through the API (the driver app is mobile). */
export class ApiUser {
  constructor(private readonly request: APIRequestContext, public token: string, public userId: string) {}

  static async login(request: APIRequestContext, phone: string): Promise<ApiUser> {
    expect((await request.post(`${API}/api/v1/auth/otp/request`, { data: { phone } })).status()).toBe(200);
    const res = await request.post(`${API}/api/v1/auth/otp/verify`, { data: { phone, code: OTP, acceptTerms: true, termsVersion: '2026-10-v1' } });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    return new ApiUser(request, body.accessToken, body.user.id);
  }

  private headers(idem = false) {
    return { Authorization: `Bearer ${this.token}`, ...(idem ? { 'Idempotency-Key': randomUUID() } : {}) };
  }
  async get(path: string) {
    return this.request.get(`${API}/api/v1${path}`, { headers: this.headers() });
  }
  async post(path: string, data?: unknown, idem = false) {
    return this.request.post(`${API}/api/v1${path}`, { headers: this.headers(idem), data });
  }
  async put(path: string, data?: unknown) {
    return this.request.put(`${API}/api/v1${path}`, { headers: this.headers(), data });
  }
}

export async function json<T = any>(res: Awaited<ReturnType<APIRequestContext['get']>>, status: number): Promise<T> {
  expect(res.status(), await res.text()).toBe(status);
  return (await res.json()) as T;
}

/**
 * Next 15-minute-aligned slot that starts within the check-in window (≤ 14 min away).
 * Waits up to ~1 minute if the next boundary is too far. Requires minLeadTimeMinutes = 0
 * (see withZeroLeadTime).
 */
export async function soonSlot(minutes = 60) {
  const step = 15 * 60_000;
  let start = Math.ceil((Date.now() + 60_000) / step) * step;
  const wait = start - Date.now() - 14 * 60_000;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  start = Math.ceil((Date.now() + 30_000) / step) * step;
  return { startAt: new Date(start).toISOString(), endAt: new Date(start + minutes * 60_000).toISOString() };
}

/** Temporarily allow booking slots that start immediately (audited admin setting change). */
export async function withZeroLeadTime<T>(request: APIRequestContext, fn: () => Promise<T>): Promise<T> {
  const admin = apiAdmin(request);
  await json(await admin.put('/admin/settings/minLeadTimeMinutes', { value: 0, reason: 'E2E: allow immediate slots for check-in tests' }), 200);
  await new Promise((r) => setTimeout(r, 5_500)); // settings cache TTL
  try {
    return await fn();
  } finally {
    await admin.put('/admin/settings/minLeadTimeMinutes', { value: 15, reason: 'E2E: restore default lead time' });
  }
}

export function laterSlot(hoursAhead: number, minutes = 60) {
  const start = new Date(Math.ceil((Date.now() + hoursAhead * 3600_000) / (15 * 60_000)) * 15 * 60_000);
  return { startAt: start.toISOString(), endAt: new Date(start.getTime() + minutes * 60_000).toISOString() };
}

export async function uiLogin(page: Page, phone: string, opts: { newUser?: boolean } = {}) {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel(/Code sent to/).fill(OTP);
  await page.getByRole('button', { name: /Verify/ }).click();
  if (opts.newUser) {
    await page.getByText('Welcome to Nexvolt!').waitFor();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Accept & create account' }).click();
  }
}

export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

/** Create a host with a VERIFIED, published 24/7 charger entirely through the API + admin API. */
export async function verifiedChargerViaApi(request: APIRequestContext, lat = 12.95, lng = 77.62) {
  const host = await ApiUser.login(request, freshPhone());
  await json(await host.post('/hosts/onboard', { displayName: 'E2E Host', hostType: 'INDIVIDUAL', attestAuthority: true, attestElectricalSafety: true, attestationVersion: '2026-10-v1' }), 201);
  const upload = async (docType: string, chargerId?: string) => {
    const r = await json(await host.post('/documents/uploads', { docType, chargerId, fileName: 'd.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length }), 201);
    expect((await request.put(r.upload.uploadUrl, { headers: r.upload.headers, data: PDF })).ok()).toBeTruthy();
    return (await json(await host.post(`/documents/${r.document.id}/complete`), 200)).id as string;
  };
  const id = await upload('IDENTITY_PROOF');
  await json(await host.post('/hosts/me/kyc/submit'), 200);
  const charger = await json(await host.post('/chargers', {
    title: 'E2E 24x7 charger', currentType: 'AC', maxPowerKw: 7.2, connectors: [{ connectorType: 'TYPE_2', powerKw: 7.2 }], meterType: 'CHARGER_DISPLAY',
    parkingType: 'PRIVATE_DRIVEWAY', accessInstructions: 'E2E secret gate code 2468', pricingUnit: 'PER_HOUR', unitPriceMinor: 10000, cancellationPolicy: 'FLEXIBLE',
    address: { line1: '7 E2E Street', locality: 'E2E Nagar', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' }, lat, lng,
  }), 201);
  await json(await host.put(`/chargers/${charger.id}/availability`, { rules: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startMinute: 0, endMinute: 1440 })), bufferMinutes: 0, minDurationMinutes: 30, maxDurationMinutes: 240, approvalMode: 'AUTOMATIC' }), 200);
  const docs = [id, await upload('PROPERTY_AUTHORIZATION', charger.id), await upload('ELECTRICAL_SAFETY_CERT', charger.id)];
  await json(await host.post(`/chargers/${charger.id}/submit`), 200);
  const admin = apiAdmin(request);
  for (const d of docs) await json(await admin.post(`/admin/documents/${d}/review`, { decision: 'ACCEPTED', notes: 'E2E automated review' }), 200);
  const me = await json(await host.get('/users/me'), 200);
  await json(await admin.post(`/admin/hosts/${me.hostProfile.id}/kyc`, { decision: 'VERIFIED', reason: 'E2E automated review' }), 200);
  const checklist = Object.fromEntries(['hostIdentityVerified', 'propertyAuthorizationReviewed', 'electricalSafetyCertificateReviewed', 'installationDetailsReviewed', 'listingContentReviewed', 'photosReviewed'].map((k) => [k, true]));
  await json(await admin.post(`/admin/chargers/${charger.id}/decision`, { decision: 'APPROVED', checklist, reason: 'E2E automated review' }), 200);
  await json(await host.post(`/chargers/${charger.id}/publish`), 200);
  return { host, admin, chargerId: charger.id as string, hostProfileId: me.hostProfile.id as string };
}

export async function driverWithVehicle(request: APIRequestContext, connectors = ['CCS2', 'TYPE_2']) {
  const driver = await ApiUser.login(request, freshPhone());
  const vehicle = await json(await driver.post('/vehicles', { manufacturer: 'Tata', model: 'Nexon EV', connectors, maxAcKw: 7.2, maxDcKw: 50 }), 201);
  return { driver, vehicleId: vehicle.id as string };
}
