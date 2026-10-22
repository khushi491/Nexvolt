import { createCharger, createTestApp, createUser, createVehicle, createVerifiedHost, idem, resetDb, slot, soonSlot, type TestCtx } from '../support/harness';

describe('Bookings (integration)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.app.close());
  beforeEach(async () => resetDb(ctx.prisma));

  async function setup() {
    const host = await createVerifiedHost(ctx);
    const charger = await createCharger(ctx, host.host.id);
    const driver = await createUser(ctx);
    const vehicle = await createVehicle(ctx, driver.user.id);
    return { host, charger, driver, vehicle };
  }
  const body = (chargerId: string, vehicleId: string, s = slot(), connectorType = 'TYPE_2') => ({ chargerId, vehicleId, connectorType, ...s, acceptPolicies: true });

  it('allows exactly one of many concurrent bookings for the same slot', async () => {
    const { charger } = await setup();
    const drivers = await Promise.all(Array.from({ length: 8 }, async () => {
      const d = await createUser(ctx);
      return { d, v: await createVehicle(ctx, d.user.id) };
    }));
    const results = await Promise.all(drivers.map(({ d, v }) => ctx.http().post('/api/v1/bookings').set(d.auth).set(idem()).send(body(charger.id, v.id))));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    expect(await ctx.prisma.booking.count()).toBe(1);
  });

  it('enforces the host buffer between bookings', async () => {
    const { charger, driver, vehicle } = await setup();
    await ctx.http().post('/api/v1/bookings').set(driver.auth).set(idem()).send(body(charger.id, vehicle.id, slot(2, 6))).expect(201);
    const other = await createUser(ctx);
    const v2 = await createVehicle(ctx, other.user.id);
    // Starts exactly when the first ends — inside the 15-minute buffer.
    const r = await ctx.http().post('/api/v1/bookings').set(other.auth).set(idem()).send(body(charger.id, v2.id, slot(2, 7)));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('SLOT_UNAVAILABLE');
  });

  it('frees capacity once a stale hold expires', async () => {
    const { charger, driver, vehicle } = await setup();
    const first = await ctx.http().post('/api/v1/bookings').set(driver.auth).set(idem()).send(body(charger.id, vehicle.id)).expect(201);
    await ctx.prisma.booking.update({ where: { id: first.body.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const other = await createUser(ctx);
    const v2 = await createVehicle(ctx, other.user.id);
    await ctx.http().post('/api/v1/bookings').set(other.auth).set(idem()).send(body(charger.id, v2.id)).expect(201);
    expect((await ctx.prisma.booking.findUniqueOrThrow({ where: { id: first.body.id } })).status).toBe('EXPIRED');
  });

  it('is idempotent per Idempotency-Key and rejects key reuse with a different body', async () => {
    const { charger, driver, vehicle } = await setup();
    const key = { 'Idempotency-Key': 'booking-key-0001' };
    const a = await ctx.http().post('/api/v1/bookings').set(driver.auth).set(key).send(body(charger.id, vehicle.id)).expect(201);
    const b = await ctx.http().post('/api/v1/bookings').set(driver.auth).set(key).send(body(charger.id, vehicle.id)).expect(201);
    expect(b.body.id).toBe(a.body.id);
    const c = await ctx.http().post('/api/v1/bookings').set(driver.auth).set(key).send(body(charger.id, vehicle.id, slot(3)));
    expect(c.status).toBe(422);
    expect(c.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    await ctx.http().post('/api/v1/bookings').set(driver.auth).send(body(charger.id, vehicle.id, slot(4))).expect(400);
  });

  it('blocks unverified, unpublished and paused chargers', async () => {
    const { host, driver, vehicle } = await setup();
    for (const o of [{ status: 'PENDING_REVIEW' as const }, { status: 'VERIFIED' as const, isPublished: false }]) {
      const c = await createCharger(ctx, host.host.id, o);
      const r = await ctx.http().post('/api/v1/bookings').set(driver.auth).set(idem()).send(body(c.id, vehicle.id));
      expect(r.status).toBe(422);
      expect(r.body.code).toBe('CHARGER_NOT_VERIFIED');
    }
    const paused = await createCharger(ctx, host.host.id);
    await ctx.prisma.charger.update({ where: { id: paused.id }, data: { pausedAt: new Date() } });
    expect((await ctx.http().post('/api/v1/bookings').set(driver.auth).set(idem()).send(body(paused.id, vehicle.id))).body.code).toBe('CHARGER_PAUSED');
  });

  it('blocks incompatible connectors', async () => {
    const { host, driver } = await setup();
    const dc = await createCharger(ctx, host.host.id, { connectors: [['CCS2', 30]], currentType: 'DC' });
    const acOnly = await createVehicle(ctx, driver.user.id, ['TYPE_2'], 3.3, null);
    const q = await ctx.http().post('/api/v1/bookings/quote').set(driver.auth).send({ chargerId: dc.id, vehicleId: acOnly.id, connectorType: 'CCS2', ...slot() }).expect(200);
    expect(q.body.valid).toBe(false);
    const r = await ctx.http().post('/api/v1/bookings').set(driver.auth).set(idem()).send(body(dc.id, acOnly.id, slot(), 'CCS2'));
    expect(r.body.code).toBe('INCOMPATIBLE_CONNECTOR');
  });

  it('hides the exact address from other users and from unconfirmed bookings', async () => {
    const { charger, driver, vehicle } = await setup();
    const b = await ctx.http().post('/api/v1/bookings').set(driver.auth).set(idem()).send(body(charger.id, vehicle.id, soonSlot())).expect(201);
    const stranger = await createUser(ctx);
    await ctx.http().get(`/api/v1/bookings/${b.body.id}/access`).set(stranger.auth).expect(404);
    await ctx.http().get(`/api/v1/bookings/${b.body.id}/access`).set(driver.auth).expect(403);
    const pub = await ctx.http().get(`/api/v1/chargers/${charger.id}`).expect(200);
    expect(JSON.stringify(pub.body)).not.toMatch(/Private Road|9999/);
  });

  it('lets only the owning host approve manual requests', async () => {
    const host = await createVerifiedHost(ctx);
    const charger = await createCharger(ctx, host.host.id, { approvalMode: 'MANUAL' });
    const driver = await createUser(ctx);
    const vehicle = await createVehicle(ctx, driver.user.id);
    const b = await ctx.http().post('/api/v1/bookings').set(driver.auth).set(idem()).send(body(charger.id, vehicle.id)).expect(201);
    expect(b.body.status).toBe('AWAITING_HOST_APPROVAL');
    const otherHost = await createVerifiedHost(ctx);
    await ctx.http().post(`/api/v1/bookings/${b.body.id}/approve`).set(otherHost.auth).expect(404);
    await ctx.http().post(`/api/v1/bookings/${b.body.id}/approve`).set(driver.auth).expect(403);
    const ok = await ctx.http().post(`/api/v1/bookings/${b.body.id}/approve`).set(host.auth).expect(200);
    expect(ok.body.status).toBe('HELD');
  });
});
