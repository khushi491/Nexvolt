import { describe, expect, it, vi } from 'vitest';
import { ApiError, NexvoltApi, type TokenStore } from '../src';

function store(
  access: string | null,
  refresh: string | null,
): TokenStore & { access: string | null } {
  return {
    access,
    getAccessToken() {
      return this.access;
    },
    getRefreshToken: () => refresh,
    setTokens(a) {
      this.access = a.accessToken;
    },
    clear() {
      this.access = null;
    },
  };
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('NexvoltApi client', () => {
  it('sends bearer tokens and idempotency keys, and builds query strings', async () => {
    const fetchMock = vi.fn(async () => json(200, []));
    const api = new NexvoltApi({
      baseUrl: 'http://api.test/',
      tokens: store('tok', null),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await api.bookings.create(
      {
        chargerId: 'c',
        vehicleId: 'v',
        connectorType: 'TYPE_2',
        startAt: 'a',
        endAt: 'b',
        acceptPolicies: true,
      },
      'key-12345678',
    );
    await api.search.chargers({ lat: 12.9, lng: 77.6, connector: undefined });
    const [[url1, init1], [url2]] = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(url1).toBe('http://api.test/api/v1/bookings');
    expect((init1.headers as Record<string, string>)['Idempotency-Key']).toBe('key-12345678');
    expect((init1.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(url2).toBe('http://api.test/api/v1/search/chargers?lat=12.9&lng=77.6');
  });

  it('refreshes once on 401 and retries, sharing one refresh across parallel calls', async () => {
    const s = store('old', 'refresh-token');
    let refreshes = 0;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes++;
        return json(200, {
          accessToken: 'new',
          refreshToken: 'r2',
          accessTokenExpiresAt: '',
          user: {},
        });
      }
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new'
        ? json(200, { ok: true })
        : json(401, { code: 'UNAUTHENTICATED', message: 'expired' });
    });
    const api = new NexvoltApi({
      baseUrl: 'http://api.test',
      tokens: s,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const [a, b] = await Promise.all([api.users.me(), api.vehicles.list()]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(refreshes).toBe(1);
  });

  it('maps API errors to ApiError with code and message', async () => {
    const api = new NexvoltApi({
      baseUrl: 'http://api.test',
      fetch: (async () =>
        json(409, {
          statusCode: 409,
          code: 'SLOT_UNAVAILABLE',
          message: 'Taken',
        })) as unknown as typeof fetch,
    });
    await expect(api.bookings.get('x')).rejects.toMatchObject({
      status: 409,
      code: 'SLOT_UNAVAILABLE',
      message: 'Taken',
    });
    await expect(api.bookings.get('x')).rejects.toBeInstanceOf(ApiError);
  });
});
