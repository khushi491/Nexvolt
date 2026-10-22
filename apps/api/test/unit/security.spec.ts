import * as shared from '@nexvolt/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { CryptoService, humanCode } from '../../src/common/crypto/crypto.service';
import { loadEnv } from '../../src/config/env';
import { sanitizeProviderPayload } from '../../src/modules/payments/payments.service';
import { RazorpayProvider } from '../../src/modules/payments/providers/razorpay.provider';
import { matchesSignature } from '../../src/modules/storage/storage.service';

describe('Prisma ↔ shared enum parity', () => {
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const prismaEnums = Object.fromEntries(
    [...schema.matchAll(/enum (\w+) \{([^}]*)\}/g)].map(([, name, body]) => [
      name,
      body
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    ]),
  );
  const pairs: Array<[string, Record<string, string>]> = [
    ['Role', shared.Role],
    ['ConnectorType', shared.ConnectorType],
    ['ChargerStatus', shared.ChargerStatus],
    ['BookingStatus', shared.BookingStatus],
    ['PaymentStatus', shared.PaymentStatus],
    ['LedgerEntryType', shared.LedgerEntryType],
    ['LedgerEntryStatus', shared.LedgerEntryStatus],
    ['PayoutStatus', shared.PayoutStatus],
    ['DisputeStatus', shared.DisputeStatus],
    ['NotificationType', shared.NotificationType],
    ['MeterType', shared.MeterType],
    ['KycStatus', shared.KycStatus],
    ['DocumentType', shared.DocumentType],
    ['SessionStatus', shared.SessionStatus],
  ];
  it.each(pairs)('%s matches', (name, values) => {
    expect(prismaEnums[name]?.sort()).toEqual(Object.values(values).sort());
  });
});

describe('Razorpay signatures', () => {
  const rz = new RazorpayProvider('rzp_test_x', 'key_secret', 'hook_secret');
  it('verifies checkout signatures (order_id|payment_id) and rejects tampering', () => {
    const sig = createHmac('sha256', 'key_secret').update('order_1|pay_1').digest('hex');
    expect(rz.verifyCheckoutSignature('order_1', 'pay_1', sig)).toBe(true);
    expect(rz.verifyCheckoutSignature('order_1', 'pay_2', sig)).toBe(false);
    expect(rz.verifyCheckoutSignature('order_1', 'pay_1', 'deadbeef')).toBe(false);
  });
  it('verifies webhook signatures over the raw body', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const sig = createHmac('sha256', 'hook_secret').update(body).digest('hex');
    expect(rz.verifyWebhookSignature(body, sig)).toBe(true);
    expect(rz.verifyWebhookSignature(Buffer.from('{"event":"payment.captured" }'), sig)).toBe(
      false,
    );
  });
  it('never stores card, email or contact data from webhook payloads', () => {
    const clean = JSON.stringify(
      sanitizeProviderPayload({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_1',
              amount: 100,
              card: { last4: '4242' },
              email: 'a@b.c',
              contact: '+919',
              vpa: 'x@upi',
            },
          },
        },
      }),
    );
    expect(clean).toContain('pay_1');
    for (const s of ['4242', 'a@b.c', '+919', 'x@upi']) expect(clean).not.toContain(s);
  });
});

describe('upload validation', () => {
  it('checks magic bytes against the declared MIME type', () => {
    expect(matchesSignature('application/pdf', Buffer.from('%PDF-1.7 ...'))).toBe(true);
    expect(
      matchesSignature('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe(true);
    expect(matchesSignature('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(matchesSignature('image/png', Buffer.from('%PDF-1.7'))).toBe(false);
    expect(matchesSignature('application/x-msdownload', Buffer.from('MZ'))).toBe(false);
  });
});

describe('field encryption', () => {
  const svc = new CryptoService({
    PII_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  } as never);
  it('round-trips and uses a random IV', () => {
    const a = svc.encrypt('12 Private Road');
    expect(a).not.toContain('Private');
    expect(svc.encrypt('12 Private Road')).not.toEqual(a);
    expect(svc.decrypt(a)).toBe('12 Private Road');
  });
  it('detects tampering', () => {
    const a = svc.encrypt('secret');
    const bad = a.slice(0, -4) + (a.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => svc.decrypt(bad)).toThrow();
  });
  it('generates unambiguous human codes', () => {
    expect(humanCode('NV')).toMatch(/^NV-[2-9A-HJ-NP-Z]{6}$/);
  });
});

describe('environment guards', () => {
  const ok = {
    DATABASE_URL: 'postgresql://x',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    OTP_HMAC_SECRET: 'y'.repeat(32),
    PII_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  };
  it('refuses demo payments and the OTP emulator in production', () => {
    expect(() =>
      loadEnv({
        ...ok,
        NODE_ENV: 'production',
        LOCAL_DEMO_MODE: 'true',
        OTP_PROVIDER: 'twilio_verify',
        TWILIO_ACCOUNT_SID: 'a',
        TWILIO_AUTH_TOKEN: 'b',
        TWILIO_VERIFY_SERVICE_SID: 'c',
      }),
    ).toThrow(/LOCAL_DEMO_MODE/);
    expect(() => loadEnv({ ...ok, NODE_ENV: 'production' })).toThrow(/OTP_PROVIDER/);
  });
  it('refuses relaxed OTP rate limits in production', () => {
    const prod = {
      ...ok,
      NODE_ENV: 'production',
      OTP_PROVIDER: 'twilio_verify',
      TWILIO_ACCOUNT_SID: 'a',
      TWILIO_AUTH_TOKEN: 'b',
      TWILIO_VERIFY_SERVICE_SID: 'c',
    };
    expect(() => loadEnv(prod)).not.toThrow();
    expect(() => loadEnv({ ...prod, OTP_REQUESTS_PER_15MIN_PER_IP: '100' })).toThrow(/Relaxed OTP/);
    expect(() => loadEnv({ ...prod, DISABLE_ROUTE_THROTTLING_FOR_TESTS: 'true' })).toThrow(
      /Route throttling/,
    );
  });
  it('refuses live Razorpay keys outside production and partial credentials', () => {
    expect(() =>
      loadEnv({
        ...ok,
        RAZORPAY_KEY_ID: 'rzp_live_x',
        RAZORPAY_KEY_SECRET: 's',
        RAZORPAY_WEBHOOK_SECRET: 'w',
      }),
    ).toThrow(/Live Razorpay/);
    expect(() => loadEnv({ ...ok, RAZORPAY_KEY_ID: 'rzp_test_x' })).toThrow(/RAZORPAY/);
  });
  it('does not echo secret values in validation errors', () => {
    try {
      loadEnv({ ...ok, JWT_ACCESS_SECRET: 'short-secret-value' });
    } catch (e) {
      expect(String(e)).not.toContain('short-secret-value');
    }
  });
});
