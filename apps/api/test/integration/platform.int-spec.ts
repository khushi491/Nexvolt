import { bookAndPayDemo, createCharger, createTestApp, createUser, createVehicle, createVerifiedHost, idem, resetDb, slot, type TestCtx } from '../support/harness';

describe('Search, auth, sessions, payouts and authorisation (integration)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.app.close());
  beforeEach(async () => resetDb(ctx.prisma));

  describe('geospatial search', () => {
    it('returns only discoverable chargers within the radius, nearest first, without private data', async () => {
      const host = await createVerifiedHost(ctx);
      const near = await createCharger(ctx, host.host.id, { lat: 12.97, lng: 77.64, title: 'near' });
      const mid = await createCharger(ctx, host.host.id, { lat: 12.99, lng: 77.66, title: 'mid' });
      await createCharger(ctx, host.host.id, { lat: 13.3, lng: 77.9, title: 'far' });
      await createCharger(ctx, host.host.id, { lat: 12.97, lng: 77.641, title: 'pending', status: 'PENDING_REVIEW' });
      await createCharger(ctx, host.host.id, { lat: 12.97, lng: 77.642, title: 'suspended', status: 'SUSPENDED', isPublished: false });
      const r = await ctx.http().get('/api/v1/search/chargers?lat=12.97&lng=77.64&radiusKm=10').expect(200);
      expect(r.body.items.map((c: { id: string }) => c.id)).toEqual([near.id, mid.id]);
      expect(JSON.stringify(r.body)).not.toMatch(/Private Road|9999/);
    });

    it('filters by connector and by vehicle compatibility, and by requested time', async () => {
      const host = await createVerifiedHost(ctx);
      const ac = await createCharger(ctx, host.host.id, { connectors: [['TYPE_2', 7.2]] });
      const dc = await createCharger(ctx, host.host.id, { connectors: [['CCS2', 30]], currentType: 'DC', lng: 77.645 });
      const r = await ctx.http().get('/api/v1/search/chargers?lat=12.97&lng=77.64&connector=CCS2').expect(200);
      expect(r.body.items.map((c: { id: string }) => c.id)).toEqual([dc.id]);
      const driver = await createUser(ctx);
      const comet = await createVehicle(ctx, driver.user.id, ['TYPE_2'], 3.3, null);
      const v = await ctx.http().get(`/api/v1/search/chargers?lat=12.97&lng=77.64&vehicleId=${comet.id}`).set(driver.auth).expect(200);
      expect(v.body.items.map((c: { id: string }) => c.id)).toEqual([ac.id]);
      expect(v.body.items[0].compatibility.effectiveKw).toBe(3.3);
      const s = slot();
      const nexon = await createVehicle(ctx, driver.user.id);
      await ctx.http().post('/api/v1/bookings').set(driver.auth).set(idem()).send({ chargerId: ac.id, vehicleId: nexon.id, connectorType: 'TYPE_2', ...s, acceptPolicies: true }).expect(201);
      const t = await ctx.http().get(`/api/v1/search/chargers?lat=12.97&lng=77.64&startAt=${encodeURIComponent(s.startAt)}&endAt=${encodeURIComponent(s.endAt)}`).expect(200);
      expect(t.body.items.map((c: { id: string }) => c.id)).toEqual([dc.id]);
    });
  });

  describe('auth', () => {
    it('requires consent for new users, locks after repeated wrong codes, and rotates refresh tokens', async () => {
      const phone = '9876500001';
      await ctx.http().post('/api/v1/auth/otp/request').send({ phone }).expect(200);
      const noConsent = await ctx.http().post('/api/v1/auth/otp/verify').send({ phone, code: '123456' }).expect(422);
      expect(noConsent.body.code).toBe('CONSENT_REQUIRED');
      await ctx.prisma.otpChallenge.deleteMany();
      await ctx.http().post('/api/v1/auth/otp/request').send({ phone }).expect(200);
      for (let i = 0; i < 5; i++) await ctx.http().post('/api/v1/auth/otp/verify').send({ phone, code: '000000' }).expect(401);
      const locked = await ctx.http().post('/api/v1/auth/otp/verify').send({ phone, code: '123456' }).expect(429);
      expect(locked.body.code).toBe('OTP_LOCKED');
      await ctx.prisma.otpChallenge.deleteMany();
      await ctx.http().post('/api/v1/auth/otp/request').send({ phone }).expect(200);
      const ok = await ctx.http().post('/api/v1/auth/otp/verify').send({ phone, code: '123456', acceptTerms: true, termsVersion: '2026-10-v1' }).expect(200);
      const r1 = await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: ok.body.refreshToken }).expect(200);
      // Reusing the rotated token revokes the whole family.
      await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: ok.body.refreshToken }).expect(401);
      await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
    });

    it('rate-limits OTP requests per phone and enforces a resend cooldown', async () => {
      const phone = '9876500002';
      await ctx.http().post('/api/v1/auth/otp/request').send({ phone }).expect(200);
      const r = await ctx.http().post('/api/v1/auth/otp/request').send({ phone }).expect(429);
      expect(r.body.code).toBe('OTP_COOLDOWN');
    });

    it('rejects suspended users immediately', async () => {
      const u = await createUser(ctx);
      await ctx.http().get('/api/v1/users/me').set(u.auth).expect(200);
      await ctx.prisma.user.update({ where: { id: u.user.id }, data: { status: 'SUSPENDED' } });
      await ctx.http().get('/api/v1/users/me').set(u.auth).expect(401);
    });
  });

  describe('authorisation', () => {
    it('enforces RBAC and ownership', async () => {
      const driver = await createUser(ctx);
      const hostA = await createVerifiedHost(ctx);
      const hostB = await createVerifiedHost(ctx);
      const support = await createUser(ctx, ['SUPPORT']);
      const c = await createCharger(ctx, hostA.host.id);
      await ctx.http().get('/api/v1/admin/overview').set(driver.auth).expect(403);
      await ctx.http().get('/api/v1/chargers/mine').set(driver.auth).expect(403);
      await ctx.http().get(`/api/v1/chargers/${c.id}/manage`).set(hostB.auth).expect(404);
      await ctx.http().patch(`/api/v1/chargers/${c.id}`).set(hostB.auth).send({ title: 'Hijacked title' }).expect(404);
      await ctx.http().get('/api/v1/admin/overview').set(support.auth).expect(200);
      await ctx.http().put('/api/v1/admin/settings/commissionBps').set(support.auth).send({ value: 0, reason: 'nope nope' }).expect(403);
      await ctx.http().get('/api/v1/users/me').expect(401);
    });
  });

  describe('sessions & payouts', () => {
    async function checkedIn() {
      const host = await createVerifiedHost(ctx);
      const charger = await createCharger(ctx, host.host.id);
      const driver = await createUser(ctx);
      const vehicle = await createVehicle(ctx, driver.user.id);
      const { booking } = await bookAndPayDemo(ctx, driver, charger.id, vehicle.id);
      const now = Date.now();
      await ctx.prisma.booking.update({ where: { id: booking.id }, data: { startAt: new Date(now - 5 * 60_000), endAt: new Date(now + 55 * 60_000), blockedUntil: new Date(now + 70 * 60_000) } });
      await ctx.http().post(`/api/v1/bookings/${booking.id}/check-in`).set(driver.auth).expect(200);
      for (const who of [driver, host]) await ctx.http().post(`/api/v1/charging-sessions/${booking.id}/start`).set(who.auth).send({ readingKwh: '100' }).expect(200);
      await ctx.prisma.chargingSession.update({ where: { bookingId: booking.id }, data: { startedAt: new Date(now - 50 * 60_000) } });
      return { host, driver, booking };
    }

    it('opens a dispute when meter readings disagree', async () => {
      const { host, driver, booking } = await checkedIn();
      await ctx.http().post(`/api/v1/charging-sessions/${booking.id}/end`).set(driver.auth).send({ readingKwh: '102' }).expect(200);
      const r = await ctx.http().post(`/api/v1/charging-sessions/${booking.id}/end`).set(host.auth).send({ readingKwh: '106' }).expect(200);
      expect(r.body.status).toBe('DISPUTED');
      expect((await ctx.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('DISPUTED');
      expect(await ctx.prisma.dispute.count({ where: { bookingId: booking.id, reason: 'METER_DISCREPANCY', status: 'OPEN' } })).toBe(1);
    });

    it('completes, settles after the dispute window, and pays out only with a bank reference', async () => {
      const { host, driver, booking } = await checkedIn();
      await ctx.http().post(`/api/v1/charging-sessions/${booking.id}/end`).set(driver.auth).send({ readingKwh: '105' }).expect(200);
      const done = await ctx.http().post(`/api/v1/charging-sessions/${booking.id}/end`).set(host.auth).send({ readingKwh: '105.02' }).expect(200);
      expect(done.body.meteredEnergyWh).toBe(5000);
      const admin = await createUser(ctx, ['ADMIN']);
      await ctx.http().post('/api/v1/admin/maintenance/settle-bookings').set(admin.auth).expect(200);
      expect((await ctx.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('COMPLETED');
      await ctx.prisma.booking.update({ where: { id: booking.id }, data: { completedAt: new Date(Date.now() - 48 * 3600_000) } });
      await ctx.http().post('/api/v1/admin/maintenance/settle-bookings').set(admin.auth).expect(200);
      expect((await ctx.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('SETTLED');
      const earnings = await ctx.http().get('/api/v1/hosts/me/earnings').set(host.auth).expect(200);
      expect(earnings.body.eligibleMinor).toBe(10_800);
      expect(earnings.body.paidOutMinor).toBe(0);
      const p = await ctx.http().post('/api/v1/admin/payouts').set(admin.auth).send({ hostId: host.host.id, reason: 'Weekly batch' }).expect(201);
      expect(p.body.status).toBe('READY_FOR_PAYOUT');
      await ctx.http().post(`/api/v1/admin/payouts/${p.body.id}/mark-paid`).set(admin.auth).send({ reason: 'Bank transfer done' }).expect(400);
      await ctx.http().post(`/api/v1/admin/payouts/${p.body.id}/mark-paid`).set(admin.auth).send({ externalReference: 'UTR0000123456', reason: 'Bank transfer done' }).expect(200);
      const after = await ctx.http().get('/api/v1/hosts/me/earnings').set(host.auth).expect(200);
      expect(after.body.paidOutMinor).toBe(10_800);
      expect(await ctx.prisma.auditLog.count({ where: { action: 'payout.mark_paid' } })).toBe(1);
    });
  });
});
