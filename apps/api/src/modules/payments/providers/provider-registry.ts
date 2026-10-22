import type { PaymentProviderName } from '@nexvolt/shared';
import { AppError } from '../../../common/errors/app-error';
import type { Env } from '../../../config/env';
import { DemoPaymentProvider } from './demo.provider';
import type { PaymentProvider } from './payment-provider';
import { RazorpayProvider } from './razorpay.provider';

/**
 * Holds every provider that may own existing payments (so refunds of older demo payments
 * still work) and selects the ACTIVE provider for new orders:
 * Razorpay when credentials exist, else DEMO when LOCAL_DEMO_MODE, else none.
 */
export class PaymentProviderRegistry {
  readonly razorpay: RazorpayProvider | null;
  readonly demo: DemoPaymentProvider | null;

  constructor(env: Env) {
    this.razorpay =
      env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET
        ? new RazorpayProvider(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET)
        : null;
    this.demo = env.LOCAL_DEMO_MODE && env.NODE_ENV !== 'production' ? new DemoPaymentProvider() : null;
  }

  get active(): PaymentProvider {
    const p = this.razorpay ?? this.demo;
    if (!p) throw AppError.unavailable('PAYMENTS_NOT_CONFIGURED', 'Payments are not configured on this server');
    return p;
  }

  get(name: PaymentProviderName): PaymentProvider {
    const p = name === 'RAZORPAY' ? this.razorpay : this.demo;
    if (!p) throw AppError.unavailable('PAYMENT_PROVIDER_UNAVAILABLE', `${name} provider is not configured`);
    return p;
  }
}

export const PROVIDER_REGISTRY = Symbol('PROVIDER_REGISTRY');
