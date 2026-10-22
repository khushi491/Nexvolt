import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';
import { REFUND_PORT } from '../bookings/refund-port';
import { PaymentsController, WebhooksController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProviderRegistry, PROVIDER_REGISTRY } from './providers/provider-registry';
import { RefundsService } from './refunds.service';

@Global()
@Module({
  controllers: [PaymentsController, WebhooksController],
  providers: [
    PaymentsService,
    RefundsService,
    {
      provide: PROVIDER_REGISTRY,
      inject: [ENV],
      useFactory: (env: Env) => new PaymentProviderRegistry(env),
    },
    { provide: REFUND_PORT, useExisting: RefundsService },
  ],
  exports: [PaymentsService, RefundsService, REFUND_PORT, PROVIDER_REGISTRY],
})
export class PaymentsModule {}
