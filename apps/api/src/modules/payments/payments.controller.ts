import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, type RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreatePaymentOrderSchema, DemoPaymentSchema, VerifyPaymentSchema } from '@nexvolt/shared';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, ReqMeta, type RequestMeta } from '../../common/auth/decorators';
import { renderCheckoutPage } from './checkout-page';
import { PaymentsService } from './payments.service';

class CreatePaymentOrderDto extends createZodDto(CreatePaymentOrderSchema) {}
class VerifyPaymentDto extends createZodDto(VerifyPaymentSchema) {}
class DemoPaymentDto extends createZodDto(DemoPaymentSchema) {}
class CheckoutVerifyDto extends createZodDto(
  z.object({ token: z.string().min(20).max(2000), providerOrderId: z.string().min(3).max(100), providerPaymentId: z.string().min(3).max(100), signature: z.string().min(10).max(200) }),
) {}
class CheckoutDemoDto extends createZodDto(z.object({ token: z.string().min(20).max(2000), outcome: z.enum(['SUCCESS', 'FAILURE']) })) {}

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createOrder(@CurrentUser() user: AuthUser, @Body() body: CreatePaymentOrderDto, @ReqMeta() meta: RequestMeta) {
    return this.payments.createOrder(user, body.bookingId, meta.idempotencyKey);
  }

  /** For native SDK integrations that receive Razorpay's callback directly. */
  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  verify(@CurrentUser() user: AuthUser, @Body() body: VerifyPaymentDto) {
    return this.payments.verifyCheckout(user.id, body);
  }

  @Post('demo/complete')
  @HttpCode(200)
  demo(@CurrentUser() user: AuthUser, @Body() body: DemoPaymentDto) {
    return this.payments.demoComplete(user.id, body.bookingId, body.outcome);
  }

  @Get('booking/:bookingId')
  forBooking(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.payments.forBooking(user, bookingId);
  }

  // ── Hosted checkout (authenticated by a short-lived, payment-scoped token) ──
  @Public()
  @ApiExcludeEndpoint()
  @Get('checkout/:paymentId')
  async checkoutPage(@Param('paymentId', ParseUUIDPipe) paymentId: string, @Query('t') token: string, @Res() res: Response) {
    const ctx = await this.payments.checkoutContext(paymentId, token ?? '');
    const nonce = randomBytes(16).toString('base64');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        `script-src 'nonce-${nonce}' https://checkout.razorpay.com`,
        `style-src 'nonce-${nonce}'`,
        "frame-src https://api.razorpay.com https://checkout.razorpay.com",
        "connect-src 'self' https://*.razorpay.com",
        "img-src 'self' data: https://*.razorpay.com",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(
      renderCheckoutPage({
        nonce,
        token,
        paymentId,
        provider: ctx.payment.provider,
        keyId: ctx.keyId,
        orderId: ctx.payment.providerOrderId,
        amountMinor: ctx.payment.amountMinor,
        bookingCode: ctx.payment.booking.code,
        title: ctx.title,
        startText: ctx.startText,
        payable: ctx.payable,
      }),
    );
  }

  @Public()
  @ApiExcludeEndpoint()
  @Post('checkout/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async checkoutVerify(@Body() body: CheckoutVerifyDto) {
    const t = await this.payments.verifyCheckoutToken(body.token);
    return this.payments.verifyCheckout(t.sub, { ...body, paymentId: t.pid });
  }

  @Public()
  @ApiExcludeEndpoint()
  @Post('checkout/demo')
  @HttpCode(200)
  async checkoutDemo(@Body() body: CheckoutDemoDto) {
    const t = await this.payments.verifyCheckoutToken(body.token);
    const bookingId = await this.payments.bookingIdForPayment(t.pid);
    return this.payments.demoComplete(t.sub, bookingId, body.outcome);
  }
}

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Post('razorpay')
  @HttpCode(200)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  razorpay(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    return this.payments.handleRazorpayWebhook(req.rawBody, signature, eventId);
  }
}
