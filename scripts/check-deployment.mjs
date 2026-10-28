// Read-only smoke check. No credentials are required or printed.
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { api: { type: 'string' }, portal: { type: 'string' }, customer: { type: 'string' } },
});
if (!values.api || !values.portal || !values.customer) {
  console.error(
    'Usage: node scripts/check-deployment.mjs --api https://… --portal https://… --customer https://…',
  );
  process.exit(1);
}

for (const value of Object.values(values)) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      'Provide HTTPS origins only, without paths, credentials, queries, or fragments.',
    );
  }
}

let failed = false;
async function check(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
async function get(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

await check('API readiness and staging providers', async () => {
  const response = await get(new URL('/api/v1/health', values.api));
  const health = await response.json();
  if (
    health.status !== 'ok' ||
    ['database', 'redis', 'storage'].some((key) => health.checks?.[key] !== 'ok')
  ) {
    throw new Error('Database, Redis, or storage is unhealthy.');
  }
  if (health.demoMode || health.integrations?.otp !== 'configured') {
    throw new Error('Hosted staging must use a configured OTP provider and disable demo mode.');
  }
  if (health.integrations?.payments !== 'configured') {
    throw new Error('Payment provider is not configured; add Razorpay test credentials.');
  }
});
for (const [name, origin, path] of [
  ['Portal login', values.portal, '/login'],
  ['Customer app', values.customer, '/'],
]) {
  await check(name, async () => {
    const response = await get(new URL(path, origin));
    if (!response.headers.get('content-type')?.includes('text/html'))
      throw new Error('Expected HTML.');
  });
  await check(`${name} API CORS`, async () => {
    const response = await get(new URL('/api/v1/health/live', values.api), {
      headers: { Origin: new URL(origin).origin },
    });
    if (response.headers.get('access-control-allow-origin') !== new URL(origin).origin) {
      throw new Error('API does not allow this exact origin.');
    }
  });
}
process.exitCode = failed ? 1 : 0;
