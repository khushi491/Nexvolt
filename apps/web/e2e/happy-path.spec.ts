import { expect, test } from '@playwright/test';
import {
  ADMIN_PHONE,
  ApiUser,
  driverWithVehicle,
  freshPhone,
  json,
  PDF,
  soonSlot,
  uiLogin,
  withZeroLeadTime,
} from './helpers';

/**
 * Spec happy path:
 * Host registers → admin approves → charger published → driver registers vehicle → discovers
 * compatible charger → books → sandbox (DEMO) payment → arrives → verifies charging → completes →
 * receipt → review → payout eligibility.
 *
 * Host and admin steps run in the real portal UI. Driver steps use the API until the mobile
 * app exists; the payment step uses the real hosted checkout page in the browser.
 */
test('host → admin → driver: full booking lifecycle', async ({ browser, request }) => {
  test.setTimeout(300_000);
  const LAT = 12.9301;
  const LNG = 77.6801;
  const hostPhone = freshPhone();
  const hostName = `E2E Happy Host ${hostPhone.slice(-4)}`;
  const tag = hostPhone.slice(-6); // unique file names per run

  // ── Host registers and lists a charger (UI) ──
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  await uiLogin(host, hostPhone, { newUser: true });
  await host.waitForURL('**/onboarding');
  await host.getByLabel('Display name').fill(hostName);
  await host.getByRole('checkbox').nth(0).check();
  await host.getByRole('checkbox').nth(1).check();
  await host.getByRole('button', { name: 'Continue' }).click();
  await host.waitForURL('**/host/profile**');
  await host
    .locator('input[type=file]')
    .setInputFiles({ name: `id-${tag}.pdf`, mimeType: 'application/pdf', buffer: PDF });
  await expect(host.getByText(`id-${tag}.pdf`)).toBeVisible();
  await host.getByRole('button', { name: 'Submit for verification' }).click();
  await expect(host.getByText('Submitted for review')).toBeVisible();

  await host.goto('/host/chargers/new');
  await host.getByLabel('Title').fill('E2E happy-path wallbox');
  await host.getByLabel('Address line 1').fill('99 Happy Path Road');
  await host.getByLabel('Locality / neighbourhood (public)').fill('Bellandur');
  await host.getByLabel('City (public)').fill('Bengaluru');
  await host.getByLabel('PIN code').fill('560103');
  await host.getByLabel('Latitude').fill(String(LAT));
  await host.getByLabel('Longitude').fill(String(LNG));
  await host
    .getByLabel('Access instructions (private — shared only with confirmed drivers)')
    .fill('Ring bell at gate 3. Code 7531.');
  await host.getByRole('button', { name: 'Save draft' }).click();
  await host.waitForURL('**tab=availability');
  const chargerId = host.url().split('/host/chargers/')[1]!.split('?')[0]!;

  // 24×7 availability via the builder: add a window to every day, set 00:00–24:00.
  for (const day of [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ]) {
    await host.getByRole('group', { name: day }).getByRole('button', { name: 'Window' }).click();
    await host.getByLabel(`${day} window 1 start`).selectOption('00:00');
    await host.getByLabel(`${day} window 1 end`).selectOption('24:00');
  }
  await host.getByLabel('Buffer between bookings (min)').fill('0');
  await host.getByRole('button', { name: 'Save availability' }).click();
  await expect(host.getByText('Availability saved')).toBeVisible();

  await host.getByRole('tab', { name: 'Documents' }).click();
  await host
    .locator('input[type=file]')
    .nth(0)
    .setInputFiles({ name: `property-${tag}.pdf`, mimeType: 'application/pdf', buffer: PDF });
  await expect(host.getByText(`property-${tag}.pdf`)).toBeVisible();
  await host
    .locator('input[type=file]')
    .nth(2)
    .setInputFiles({ name: `safety-${tag}.pdf`, mimeType: 'application/pdf', buffer: PDF });
  await expect(host.getByText(`safety-${tag}.pdf`)).toBeVisible();
  await host.getByRole('tab', { name: 'Verification' }).click();
  await host.getByRole('button', { name: 'Submit for review' }).click();
  await expect(host.getByText('Under review')).toBeVisible();

  // Not yet visible to drivers.
  const hidden = await request.get(`http://localhost:4000/api/v1/chargers/${chargerId}`);
  expect(hidden.status()).toBe(404);

  // ── Admin reviews and approves (UI) ──
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await uiLogin(admin, ADMIN_PHONE);
  await admin.waitForURL('**/admin');
  await admin.goto('/admin/verification?tab=documents');
  for (const file of [`id-${tag}.pdf`, `property-${tag}.pdf`, `safety-${tag}.pdf`]) {
    const row = admin.getByRole('row').filter({ hasText: file });
    await row.getByRole('button', { name: 'Accept', exact: true }).click();
    await admin.getByLabel(/Reason/).fill('E2E: document reviewed');
    await admin.getByRole('dialog').getByRole('button', { name: 'Accepted' }).click();
    await expect(row).toHaveCount(0);
  }
  await admin.getByRole('tab', { name: /Host identity/ }).click();
  const hostRow = admin.getByRole('row').filter({ hasText: hostName });
  await hostRow.getByRole('button', { name: 'Verify', exact: true }).click();
  await admin.getByLabel(/Reason/).fill('E2E: identity matches');
  await admin.getByRole('dialog').getByRole('button', { name: 'Verified' }).click();
  await expect(hostRow).toHaveCount(0);
  await admin.goto(`/admin/chargers/${chargerId}`);
  await admin.getByText('Approval checklist').waitFor();
  for (const cb of await admin.getByRole('checkbox').all()) await cb.check();
  await admin.getByRole('button', { name: 'Approve' }).click();
  await admin.getByLabel(/Reason/).fill('E2E: all documents reviewed');
  await admin.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(admin.getByText('Verified', { exact: true }).first()).toBeVisible();

  // ── Host publishes (UI) ──
  await host.goto(`/host/chargers/${chargerId}`);
  await host.getByRole('button', { name: 'Publish' }).click();
  await expect(host.getByText('Live', { exact: true })).toBeVisible();

  // ── Driver registers a vehicle and discovers the charger ──
  const { driver, vehicleId } = await driverWithVehicle(request);
  const search = await json(
    await driver.get(`/search/chargers?lat=${LAT}&lng=${LNG}&radiusKm=3&vehicleId=${vehicleId}`),
    200,
  );
  const hit = search.items.find((c: { id: string }) => c.id === chargerId);
  expect(hit, 'charger discoverable').toBeTruthy();
  expect(hit.compatibility.compatible).toBe(true);
  expect(JSON.stringify(search)).not.toContain('Happy Path Road');

  let booking: { id: string; code: string } = { id: '', code: '' };
  // ── Book a slot starting soon and pay through the hosted DEMO checkout (browser) ──
  await withZeroLeadTime(request, async () => {
    const slot = await soonSlot(60);
    const quote = await json(
      await driver.post('/bookings/quote', {
        chargerId,
        vehicleId,
        connectorType: 'TYPE_2',
        ...slot,
      }),
      200,
    );
    expect(quote.valid).toBe(true);
    expect(quote.pricing.totalMinor).toBe(10_000);
    booking = await json(
      await driver.post(
        '/bookings',
        { chargerId, vehicleId, connectorType: 'TYPE_2', ...slot, acceptPolicies: true },
        true,
      ),
      201,
    );
    const order = await json(
      await driver.post('/payments/orders', { bookingId: booking.id }, true),
      201,
    );
    expect(order.isDemo).toBe(true);
    const checkout = await browser.newPage();
    await checkout.goto(order.checkoutUrl);
    await expect(checkout.getByRole('alert')).toContainText('DEMO PAYMENT');
    await checkout.getByRole('button', { name: 'Simulate successful DEMO payment' }).click();
    await expect(checkout.getByRole('status')).toContainText('Payment verified');
    expect((await json(await driver.get(`/bookings/${booking.id}`), 200)).status).toBe('CONFIRMED');

    // Exact address is available to the confirmed driver near the start time.
    const access = await json(await driver.get(`/bookings/${booking.id}/access`), 200);
    expect(access.address.line1).toBe('99 Happy Path Road');
    expect(access.accessInstructions).toContain('7531');
    expect(access.navigationUrl).toContain('google.com/maps');

    // ── Arrival and session (host via UI, driver via API) ──
    await host.goto('/host/bookings');
    const row = host.getByRole('row').filter({ hasText: booking.code });
    await row.getByRole('button', { name: 'Check in driver' }).click();
    await expect(row.getByText('Checked in')).toBeVisible();
    await row.getByRole('button', { name: 'Confirm start' }).click();
    await host.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await json(await driver.post(`/charging-sessions/${booking.id}/start`, {}), 200);
    await json(await driver.post(`/charging-sessions/${booking.id}/end`, {}), 200);
    await host.reload();
    await host
      .getByRole('row')
      .filter({ hasText: booking.code })
      .getByRole('button', { name: 'Confirm end' })
      .click();
    await host.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await expect
      .poll(async () => (await json(await driver.get(`/bookings/${booking.id}`), 200)).status)
      .toBe('COMPLETED');
  });

  // ── Receipt and review ──
  const receipt = await json(await driver.get(`/bookings/${booking.id}/receipt`), 200);
  expect(receipt.isDemoPayment).toBe(true);
  expect(receipt.netPaidMinor).toBe(10_000);
  expect(receipt.notes.join(' ')).toContain('DEMO PAYMENT');
  await json(
    await driver.post('/reviews', {
      bookingId: booking.id,
      rating: 5,
      comment: 'Smooth E2E session',
    }),
    201,
  );

  // ── Payout eligibility: earnings are recorded but held until the dispute window closes ──
  // Reuse the browser session: a fast run can still be inside the OTP resend cooldown.
  const hostAuth = await json(
    await host.request.post('/api/session/refresh', {
      headers: { Origin: new URL(host.url()).origin },
    }),
    200,
  );
  const hostApi = new ApiUser(request, hostAuth.accessToken, hostAuth.user.id);
  const earnings = await json(await hostApi.get('/hosts/me/earnings'), 200);
  expect(earnings.grossMinor).toBe(10_000);
  expect(earnings.pendingMinor).toBe(9_000); // 10% commission, DEMO payments carry no gateway fee
  expect(earnings.eligibleMinor).toBe(0);
  await host.goto('/host/earnings');
  await expect(host.getByText('Eligible for payout')).toBeVisible();

  await hostCtx.close();
  await adminCtx.close();
});
