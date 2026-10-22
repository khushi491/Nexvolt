import { Logger } from '@nestjs/common';
import { hmacSha256Hex, safeEqual } from '../../../common/crypto/crypto.service';
import { AppError } from '../../../common/errors/app-error';
import type { CreateOrderInput, PaymentProvider, ProviderPayment, ProviderRefund } from './payment-provider';

interface RzpPayment {
  id: string;
  order_id: string;
  status: ProviderPayment['status'];
  amount: number;
  currency: string;
  method?: string | null;
  fee?: number | null;
  tax?: number | null;
  amount_refunded?: number;
  error_description?: string | null;
}

interface RzpRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: ProviderRefund['status'];
  notes?: Record<string, string> | [];
}

const API = 'https://api.razorpay.com/v1';

export function mapRzpPayment(p: RzpPayment): ProviderPayment {
  return {
    id: p.id,
    orderId: p.order_id,
    status: p.status,
    amountMinor: p.amount,
    currency: p.currency,
    method: p.method ?? null,
    feeMinor: p.fee ?? null,
    taxMinor: p.tax ?? null,
    amountRefundedMinor: p.amount_refunded ?? 0,
    errorDescription: p.error_description ?? null,
  };
}

export function mapRzpRefund(r: RzpRefund): ProviderRefund {
  const notes = Array.isArray(r.notes) ? {} : (r.notes ?? {});
  return { id: r.id, paymentId: r.payment_id, amountMinor: r.amount, status: r.status, internalRefundId: notes.nexvolt_refund_id ?? null };
}

/**
 * Razorpay Payments via REST (Orders → Checkout → server verification).
 * Use TEST keys (rzp_test_…) outside production. Signatures are verified server-side and
 * payment state is always re-fetched from Razorpay; client callbacks are never trusted.
 * Marketplace split settlement (Route) is NOT used: it requires separate onboarding.
 */
export class RazorpayProvider implements PaymentProvider {
  readonly name = 'RAZORPAY' as const;
  readonly isDemo = false;
  private readonly logger = new Logger('Razorpay');

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {}

  get publicKeyId(): string {
    return this.keyId;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { code?: string; description?: string } };
    if (!res.ok) {
      // Never log request bodies or keys.
      this.logger.warn(`Razorpay ${method} ${path.split('/').slice(0, 2).join('/')} → HTTP ${res.status} ${json.error?.code ?? ''}`);
      throw AppError.unavailable('PAYMENT_PROVIDER_ERROR', json.error?.description ?? 'Payment provider request failed');
    }
    return json;
  }

  async createOrder(input: CreateOrderInput) {
    const o = await this.call<{ id: string }>('POST', '/orders', {
      amount: input.amountMinor,
      currency: input.currency,
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
    });
    return { orderId: o.id };
  }

  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
    return safeEqual(hmacSha256Hex(this.keySecret, `${orderId}|${paymentId}`), signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    return safeEqual(hmacSha256Hex(this.webhookSecret, rawBody), signature);
  }

  async fetchPayment(paymentId: string) {
    return mapRzpPayment(await this.call<RzpPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`));
  }

  async fetchOrderPayments(orderId: string) {
    const r = await this.call<{ items: RzpPayment[] }>('GET', `/orders/${encodeURIComponent(orderId)}/payments`);
    return r.items.map(mapRzpPayment);
  }

  async capture(paymentId: string, amountMinor: number, currency: string) {
    return mapRzpPayment(await this.call<RzpPayment>('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountMinor, currency }));
  }

  async refund(paymentId: string, amountMinor: number, internalRefundId: string) {
    return mapRzpRefund(
      await this.call<RzpRefund>('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, {
        amount: amountMinor,
        speed: 'normal',
        receipt: internalRefundId.slice(0, 40),
        notes: { nexvolt_refund_id: internalRefundId },
      }),
    );
  }

  async fetchRefunds(paymentId: string) {
    const r = await this.call<{ items: RzpRefund[] }>('GET', `/payments/${encodeURIComponent(paymentId)}/refunds`);
    return r.items.map(mapRzpRefund);
  }
}
