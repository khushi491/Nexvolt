import type { PaymentProviderName } from '@nexvolt/shared';

/** Provider-agnostic view of a payment, always fetched from the provider (never from the client). */
export interface ProviderPayment {
  id: string;
  orderId: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  amountMinor: number;
  currency: string;
  method: string | null;
  feeMinor: number | null;
  taxMinor: number | null;
  amountRefundedMinor: number;
  errorDescription: string | null;
}

export interface ProviderRefund {
  id: string;
  paymentId: string;
  amountMinor: number;
  status: 'pending' | 'processed' | 'failed';
  /** Our Refund.id, round-tripped via provider notes. */
  internalRefundId: string | null;
}

export interface CreateOrderInput {
  amountMinor: number;
  currency: 'INR';
  receipt: string;
  notes: Record<string, string>;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  readonly isDemo: boolean;
  /** Public key id that is safe to ship to clients (Razorpay key_id). */
  readonly publicKeyId: string | null;
  createOrder(input: CreateOrderInput): Promise<{ orderId: string }>;
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  fetchOrderPayments(orderId: string): Promise<ProviderPayment[]>;
  capture(paymentId: string, amountMinor: number, currency: string): Promise<ProviderPayment>;
  refund(paymentId: string, amountMinor: number, internalRefundId: string): Promise<ProviderRefund>;
  fetchRefunds(paymentId: string): Promise<ProviderRefund[]>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
