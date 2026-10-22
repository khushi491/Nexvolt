import { randomUUID } from 'node:crypto';
import { AppError } from '../../../common/errors/app-error';
import type {
  CreateOrderInput,
  PaymentProvider,
  ProviderPayment,
  ProviderRefund,
} from './payment-provider';

/**
 * LOCAL_DEMO_MODE ONLY. Simulates a gateway so the full flow can be exercised without
 * credentials. No money moves. Every payment it touches is stored with isDemo = true and
 * every UI surface labels it "DEMO PAYMENT". Env validation forbids it in production.
 */
export class DemoPaymentProvider implements PaymentProvider {
  readonly name = 'DEMO' as const;
  readonly isDemo = true;
  readonly publicKeyId = null;

  async createOrder(_input: CreateOrderInput) {
    return { orderId: `demo_order_${randomUUID().replace(/-/g, '').slice(0, 20)}` };
  }

  verifyCheckoutSignature(): boolean {
    return false; // demo payments never go through signature verification
  }

  verifyWebhookSignature(): boolean {
    return false; // there are no demo webhooks
  }

  /** Build the simulated provider state for a demo checkout outcome. */
  simulate(orderId: string, amountMinor: number, outcome: 'SUCCESS' | 'FAILURE'): ProviderPayment {
    return {
      id: `demo_pay_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      orderId,
      status: outcome === 'SUCCESS' ? 'captured' : 'failed',
      amountMinor,
      currency: 'INR',
      method: 'demo',
      feeMinor: 0,
      taxMinor: 0,
      amountRefundedMinor: 0,
      errorDescription: outcome === 'FAILURE' ? 'DEMO: simulated payment failure' : null,
    };
  }

  async fetchPayment(): Promise<ProviderPayment> {
    throw AppError.unprocessable('DEMO_PROVIDER', 'Demo payments have no provider state to fetch');
  }

  async fetchOrderPayments(): Promise<ProviderPayment[]> {
    return [];
  }

  async capture(): Promise<ProviderPayment> {
    throw AppError.unprocessable('DEMO_PROVIDER', 'Demo payments are captured at simulation time');
  }

  async refund(
    paymentId: string,
    amountMinor: number,
    internalRefundId: string,
  ): Promise<ProviderRefund> {
    return {
      id: `demo_rfnd_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      paymentId,
      amountMinor,
      status: 'processed',
      internalRefundId,
    };
  }

  async fetchRefunds(): Promise<ProviderRefund[]> {
    return [];
  }
}
