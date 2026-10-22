import { expect, test } from '@playwright/test';
import {
  ApiUser,
  driverWithVehicle,
  freshPhone,
  json,
  laterSlot,
  soonSlot,
  verifiedChargerViaApi,
  withZeroLeadTime,
} from './helpers';

/**
 * Spec negative paths: unverified charger blocked; incompatible connector blocked; overlap
 * blocked; payment failure → no confirmation; unauthorized exact address blocked;
 * cancellation/refund works; meter discrepancy generates dispute.
 */
test.describe.serial('negative paths', () => {
  let chargerId: string;
  let hostAuth: { token: string; userId: string };

  test.beforeAll(async ({ request }) => {
    const r = await verifiedChargerViaApi(request, 12.9601, 77.5901);
    chargerId = r.chargerId;
    hostAuth = { token: r.host.token, userId: r.host.userId };
  });

  test('unverified charger is hidden and cannot be booked', async ({ request }) => {
    const pendingHost = await ApiUser.login(request, freshPhone());
    await json(
      await pendingHost.post('/hosts/onboard', {
        displayName: 'Unverified Host',
        hostType: 'INDIVIDUAL',
        attestAuthority: true,
        attestElectricalSafety: true,
        attestationVersion: '2026-10-v1',
      }),
      201,
    );
    const draft = await json(
      await pendingHost.post('/chargers', {
        title: 'Unverified draft charger',
        currentType: 'AC',
        maxPowerKw: 7.2,
        connectors: [{ connectorType: 'TYPE_2', powerKw: 7.2 }],
        meterType: 'NONE',
        parkingType: 'OPEN_LOT',
        pricingUnit: 'PER_HOUR',
        unitPriceMinor: 5000,
        cancellationPolicy: 'FLEXIBLE',
        address: {
          line1: '1 Hidden Lane',
          locality: 'Hiddenpur',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560002',
        },
        lat: 12.961,
        lng: 77.591,
      }),
      201,
    );
    const { driver, vehicleId } = await driverWithVehicle(request);
    const search = await json(
      await driver.get('/search/chargers?lat=12.961&lng=77.591&radiusKm=2'),
      200,
    );
    expect(search.items.map((c: { id: string }) => c.id)).not.toContain(draft.id);
    expect((await driver.get(`/chargers/${draft.id}`)).status()).toBe(404);
    const res = await driver.post(
      '/bookings',
      {
        chargerId: draft.id,
        vehicleId,
        connectorType: 'TYPE_2',
        ...laterSlot(30),
        acceptPolicies: true,
      },
      true,
    );
    expect(res.status()).toBe(422);
    expect((await res.json()).code).toBe('CHARGER_NOT_VERIFIED');
  });

  test('incompatible connector is blocked', async ({ request }) => {
    const { driver, vehicleId } = await driverWithVehicle(request, ['CCS2']);
    const quote = await json(
      await driver.post('/bookings/quote', {
        chargerId,
        vehicleId,
        connectorType: 'TYPE_2',
        ...laterSlot(30),
      }),
      200,
    );
    expect(quote.valid).toBe(false);
    const res = await driver.post(
      '/bookings',
      { chargerId, vehicleId, connectorType: 'TYPE_2', ...laterSlot(30), acceptPolicies: true },
      true,
    );
    expect((await res.json()).code).toBe('INCOMPATIBLE_CONNECTOR');
  });

  test('overlapping booking is blocked', async ({ request }) => {
    const slot = laterSlot(40);
    const a = await driverWithVehicle(request);
    const b = await driverWithVehicle(request);
    await json(
      await a.driver.post(
        '/bookings',
        {
          chargerId,
          vehicleId: a.vehicleId,
          connectorType: 'TYPE_2',
          ...slot,
          acceptPolicies: true,
        },
        true,
      ),
      201,
    );
    const res = await b.driver.post(
      '/bookings',
      { chargerId, vehicleId: b.vehicleId, connectorType: 'TYPE_2', ...slot, acceptPolicies: true },
      true,
    );
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe('SLOT_UNAVAILABLE');
  });

  test('payment failure does not confirm the booking', async ({ request, page }) => {
    const { driver, vehicleId } = await driverWithVehicle(request);
    const booking = await json(
      await driver.post(
        '/bookings',
        { chargerId, vehicleId, connectorType: 'TYPE_2', ...laterSlot(50), acceptPolicies: true },
        true,
      ),
      201,
    );
    const order = await json(
      await driver.post('/payments/orders', { bookingId: booking.id }, true),
      201,
    );
    await page.goto(order.checkoutUrl);
    await page.getByRole('button', { name: 'Simulate failed DEMO payment' }).click();
    await expect(page.getByRole('status')).not.toContainText('Payment verified');
    const after = await json(await driver.get(`/bookings/${booking.id}`), 200);
    expect(after.status).toBe('PENDING_PAYMENT');
    expect(after.payment.status).toBe('FAILED');
    expect((await driver.get(`/bookings/${booking.id}/receipt`)).status()).toBe(422);
  });

  test('exact address is not exposed to unauthorised users', async ({ request }) => {
    const { driver, vehicleId } = await driverWithVehicle(request);
    const stranger = await ApiUser.login(request, freshPhone());
    const booking = await json(
      await driver.post(
        '/bookings',
        { chargerId, vehicleId, connectorType: 'TYPE_2', ...laterSlot(60), acceptPolicies: true },
        true,
      ),
      201,
    );
    expect((await stranger.get(`/bookings/${booking.id}/access`)).status()).toBe(404);
    expect((await driver.get(`/bookings/${booking.id}/access`)).status()).toBe(403); // not confirmed
    const pub = await request.get(`http://localhost:4000/api/v1/chargers/${chargerId}`);
    expect(await pub.text()).not.toContain('E2E Street');
    expect(await pub.text()).not.toContain('2468');
  });

  test('cancellation issues a refund per policy', async ({ request }) => {
    const { driver, vehicleId } = await driverWithVehicle(request);
    const booking = await json(
      await driver.post(
        '/bookings',
        { chargerId, vehicleId, connectorType: 'TYPE_2', ...laterSlot(70), acceptPolicies: true },
        true,
      ),
      201,
    );
    await json(await driver.post('/payments/orders', { bookingId: booking.id }, true), 201);
    expect(
      (
        await json(
          await driver.post('/payments/demo/complete', {
            bookingId: booking.id,
            outcome: 'SUCCESS',
          }),
          200,
        )
      ).bookingStatus,
    ).toBe('CONFIRMED');
    const preview = await json(
      await driver.get(`/bookings/${booking.id}/cancellation-preview`),
      200,
    );
    expect(preview.refundMinor).toBe(10_000); // FLEXIBLE, > 1h before start → full refund
    const cancelled = await json(
      await driver.post(`/bookings/${booking.id}/cancel`, { reason: 'E2E plans changed' }),
      200,
    );
    expect(cancelled.status).toBe('CANCELLED');
    const pay = await json(await driver.get(`/payments/booking/${booking.id}`), 200);
    expect(pay.refunds[0].status).toBe('PROCESSED');
    expect(pay.refunds[0].amountMinor).toBe(10_000);
  });

  test('meter discrepancy opens a dispute', async ({ request }) => {
    test.setTimeout(180_000);
    const host = new ApiUser(request, hostAuth.token, hostAuth.userId);
    await withZeroLeadTime(request, async () => {
      const { driver, vehicleId } = await driverWithVehicle(request);
      const booking = await json(
        await driver.post(
          '/bookings',
          {
            chargerId,
            vehicleId,
            connectorType: 'TYPE_2',
            ...(await soonSlot(60)),
            acceptPolicies: true,
          },
          true,
        ),
        201,
      );
      await json(await driver.post('/payments/orders', { bookingId: booking.id }, true), 201);
      await json(
        await driver.post('/payments/demo/complete', { bookingId: booking.id, outcome: 'SUCCESS' }),
        200,
      );
      await json(await driver.post(`/bookings/${booking.id}/check-in`), 200);
      await json(
        await driver.post(`/charging-sessions/${booking.id}/start`, { readingKwh: '1000.000' }),
        200,
      );
      await json(
        await host.post(`/charging-sessions/${booking.id}/start`, { readingKwh: '1000.000' }),
        200,
      );
      await json(
        await driver.post(`/charging-sessions/${booking.id}/end`, { readingKwh: '1000.010' }),
        200,
      );
      const s = await json(
        await host.post(`/charging-sessions/${booking.id}/end`, { readingKwh: '1000.150' }),
        200,
      );
      expect(s.status).toBe('DISPUTED');
      expect(s.assessment.status).toBe('DISCREPANCY');
      expect((await json(await driver.get(`/bookings/${booking.id}`), 200)).hasOpenDispute).toBe(
        true,
      );
      const mine = await json(await driver.get('/disputes/mine'), 200);
      expect(mine.find((d: { bookingId: string }) => d.bookingId === booking.id).reason).toBe(
        'METER_DISCREPANCY',
      );
    });
  });
});
