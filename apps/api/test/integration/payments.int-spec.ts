import { createCharger, createTestApp, createUser, createVehicle, createVerifiedHost, idem, resetDb, slot, soonSlot, type TestCtx } from '../support/harness';

describe('Payments & webhooks (integration, fake Razorpay)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp({ razorpay: true });
  });
  afterAll(async () => ctx.app.close());
  beforeEach(async () => resetDb(ctx.prisma));

  async function pendingBooking(s = slot()) {
    const host = await createVerifiedHost(ctx);
    const charger = await createCharger(ctx, host.host.id);
    const driver = await createUser(ctx);
    const vehicle = await createVehicle(ctx, driver.user.id);
    const b = await ctx.http().post('/api/v1/bookings').set(driver.auth).set(idem()).send({ chargerId: charger.id, vehicleId: vehicle.id, connectorType: 'TYPE_2', ...s, acceptPolicies: true }).expect(201);
    const order = await ctx.http().post('/api/v1/payments/orders').set(driver.auth).set(idem()).send({ bookingId: b.body.id }).expect(201);
    expect(order.body.provider).toBe('RAZORPAY');
    expect(order.body.isDemo).toBe(false);
    return { host, charger, driver, vehicle, bookingId: b.body.id as string, orderId: order.body.providerOrderId as string };
  }
  const webhook = (w: { body: string; signature: string; eventId: string }) =>
    ctx.http().post('/api/v1/webhooks/razorpay').set('Content-Type', 'application/json').set('x-razorpay-signature', w.signature).set('x-razorpay-event-id', w.eventId).send(w.body);
  const status = async (id: string) => (await ctx.prisma.booking.findUniqueOrThrow({ where: { id } })).status;

  it('rejects webhooks with an invalid signature', async () => {
    const { orderId } = await pendingBooking();
    const w = ctx.razorpay!.webhook('payment.captured', ctx.razorpay!.pay(orderId));
    await webhook({ ...w, signature: 'f'.repeat(64) }).expect(400);
    expect(await ctx.prisma.paymentEvent.count()).toBe(0);
  });

  it('confirms a booking from a verified captured webhook and posts the ledger once, even when retried', async () => {
    const { bookingId, orderId } = await pendingBooking();
    const w = ctx.razorpay!.webhook('payment.captured', ctx.razorpay!.pay(orderId));
    await webhook(w).expect(200);
    const dup = await webhook(w).expect(200);
    expect(dup.body.status).toBe('duplicate');
    // A second, different event for the same payment must not double-post either.
    await webhook(ctx.razorpay!.webhook('order.paid', [...ctx.razorpay!.payments.values()][0]!)).expect(200);
    expect(await status(bookingId)).toBe('CONFIRMED');
    const ledger = await ctx.prisma.hostLedgerEntry.findMany({ where: { bookingId } });
    expect(ledger.map((l) => l.type).sort()).toEqual(['BOOKING_GROSS', 'PAYMENT_FEE', 'PLATFORM_COMMISSION']);
    expect(ledger.reduce((s, l) => s + l.amountMinor, 0)).toBe(12_000 - 1_200 - 236);
    const stored = JSON.stringify(await ctx.prisma.paymentEvent.findMany());
    expect(stored).not.toMatch(/4242|x@example.com/);
  });

  it('never moves a payment backwards when events arrive out of order', async () => {
    const { bookingId, orderId } = await pendingBooking();
    const p = ctx.razorpay!.pay(orderId);
    await webhook(ctx.razorpay!.webhook('payment.captured', p)).expect(200);
    await webhook(ctx.razorpay!.webhook('payment.authorized', { ...p, status: 'authorized' })).expect(200);
    await webhook(ctx.razorpay!.webhook('payment.failed', { ...p, status: 'failed' })).expect(200);
    expect(await status(bookingId)).toBe('CONFIRMED');
    expect((await ctx.prisma.payment.findFirstOrThrow({ where: { bookingId } })).status).toBe('CAPTURED');
  });

  it('captures authorised payments server-side', async () => {
    const { bookingId, orderId } = await pendingBooking();
    await webhook(ctx.razorpay!.webhook('payment.authorized', ctx.razorpay!.pay(orderId, 'authorized'))).expect(200);
    expect(await status(bookingId)).toBe('CONFIRMED');
  });

  it('does not confirm on a failed payment, and rejects forged client signatures', async () => {
    const { bookingId, orderId, driver } = await pendingBooking();
    const failed = ctx.razorpay!.pay(orderId, 'failed');
    await webhook(ctx.razorpay!.webhook('payment.failed', failed)).expect(200);
    expect(await status(bookingId)).toBe('PENDING_PAYMENT');
    const good = ctx.razorpay!.pay(orderId, 'captured');
    await ctx.http().post('/api/v1/payments/verify').set(driver.auth).send({ bookingId, providerOrderId: orderId, providerPaymentId: good.id, signature: 'a'.repeat(64) }).expect(422);
    expect(await status(bookingId)).toBe('PENDING_PAYMENT');
    const sig = ctx.razorpay!.checkoutSignature(orderId, good.id);
    await ctx.http().post('/api/v1/payments/verify').set(driver.auth).send({ bookingId, providerOrderId: orderId, providerPaymentId: good.id, signature: sig }).expect(200);
    expect(await status(bookingId)).toBe('CONFIRMED');
  });

  it('refunds in full when payment lands after the hold expired and the slot was taken', async () => {
    const { bookingId, orderId, charger } = await pendingBooking();
    await ctx.prisma.booking.update({ where: { id: bookingId }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const rival = await createUser(ctx);
    const rv = await createVehicle(ctx, rival.user.id);
    const b = await ctx.prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await ctx.http().post('/api/v1/bookings').set(rival.auth).set(idem()).send({ chargerId: charger.id, vehicleId: rv.id, connectorType: 'TYPE_2', startAt: b.startAt.toISOString(), endAt: b.endAt.toISOString(), acceptPolicies: true }).expect(201);
    await webhook(ctx.razorpay!.webhook('payment.captured', ctx.razorpay!.pay(orderId))).expect(200);
    expect(await status(bookingId)).toBe('FAILED');
    const pay = await ctx.prisma.payment.findFirstOrThrow({ where: { bookingId } });
    expect(pay.amountRefundedMinor).toBe(pay.amountMinor);
    expect(await ctx.prisma.hostLedgerEntry.count({ where: { bookingId } })).toBe(0);
  });

  it('refunds per policy on driver cancellation and reverses host earnings', async () => {
    const { bookingId, orderId, driver } = await pendingBooking(soonSlot(3)); // ~3-4h ahead: MODERATE → 50%
    await webhook(ctx.razorpay!.webhook('payment.captured', ctx.razorpay!.pay(orderId))).expect(200);
    const res = await ctx.http().post(`/api/v1/bookings/${bookingId}/cancel`).set(driver.auth).send({ reason: 'Plans changed' }).expect(200);
    expect(res.body.status).toBe('CANCELLED');
    const refund = await ctx.prisma.refund.findFirstOrThrow({ where: { bookingId } });
    expect(refund.amountMinor).toBe(6_000);
    expect(refund.status).toBe('PROCESSED');
    const net = (await ctx.prisma.hostLedgerEntry.findMany({ where: { bookingId } })).reduce((s, l) => s + l.amountMinor, 0);
    // Host keeps the retained 50% minus commission on it and the gateway fee share.
    expect(net).toBe(6_000 - 600 - 236);
    // Retrying the cancel cannot refund twice.
    await ctx.http().post(`/api/v1/bookings/${bookingId}/cancel`).set(driver.auth).send({ reason: 'again' }).expect(409);
    expect(await ctx.prisma.refund.count({ where: { bookingId } })).toBe(1);
  });
});
