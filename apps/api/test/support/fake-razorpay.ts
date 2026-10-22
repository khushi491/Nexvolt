import { createHmac, randomUUID } from 'node:crypto';
import type { ProviderPayment, ProviderRefund } from '../../src/modules/payments/providers/payment-provider';
import { RazorpayProvider } from '../../src/modules/payments/providers/razorpay.provider';

export const FAKE_KEY_SECRET = 'rzp_test_secret_for_tests';
export const FAKE_WEBHOOK_SECRET = 'whsec_test_for_tests';

/**
 * In-memory stand-in for Razorpay's REST API. Signature maths is the real implementation
 * (inherited); only network calls are replaced.
 */
export class FakeRazorpay extends RazorpayProvider {
  orders = new Map<string, { amount: number }>();
  payments = new Map<string, ProviderPayment>();
  refunds: ProviderRefund[] = [];

  constructor() {
    super('rzp_test_fakekey', FAKE_KEY_SECRET, FAKE_WEBHOOK_SECRET);
  }

  override async createOrder(input: { amountMinor: number }) {
    const orderId = `order_${randomUUID().slice(0, 14)}`;
    this.orders.set(orderId, { amount: input.amountMinor });
    return { orderId };
  }

  /** Simulate the customer paying in Checkout. */
  pay(orderId: string, status: ProviderPayment['status'] = 'captured', fee = 236): ProviderPayment {
    const o = this.orders.get(orderId)!;
    const p: ProviderPayment = { id: `pay_${randomUUID().slice(0, 14)}`, orderId, status, amountMinor: o.amount, currency: 'INR', method: 'upi', feeMinor: status === 'captured' ? fee : null, taxMinor: status === 'captured' ? 36 : null, amountRefundedMinor: 0, errorDescription: status === 'failed' ? 'Payment declined' : null };
    this.payments.set(p.id, p);
    return p;
  }

  checkoutSignature(orderId: string, paymentId: string): string {
    return createHmac('sha256', FAKE_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  }

  webhook(event: string, payment: ProviderPayment, eventId = `evt_${randomUUID().slice(0, 12)}`) {
    const body = JSON.stringify({ entity: 'event', event, payload: { payment: { entity: { id: payment.id, order_id: payment.orderId, status: payment.status, amount: payment.amountMinor, currency: 'INR', card: { last4: '4242' }, email: 'x@example.com' } } } });
    return { body, signature: createHmac('sha256', FAKE_WEBHOOK_SECRET).update(body).digest('hex'), eventId };
  }

  override async fetchPayment(id: string) {
    const p = this.payments.get(id);
    if (!p) throw new Error('not found');
    return { ...p };
  }

  override async fetchOrderPayments(orderId: string) {
    return [...this.payments.values()].filter((p) => p.orderId === orderId);
  }

  override async capture(id: string) {
    const p = this.payments.get(id)!;
    p.status = 'captured';
    p.feeMinor = 236;
    return { ...p };
  }

  override async refund(paymentId: string, amountMinor: number, internalRefundId: string) {
    const r: ProviderRefund = { id: `rfnd_${randomUUID().slice(0, 14)}`, paymentId, amountMinor, status: 'processed', internalRefundId };
    this.refunds.push(r);
    const p = this.payments.get(paymentId);
    if (p) p.amountRefundedMinor += amountMinor;
    return r;
  }

  override async fetchRefunds(paymentId: string) {
    return this.refunds.filter((r) => r.paymentId === paymentId);
  }
}
