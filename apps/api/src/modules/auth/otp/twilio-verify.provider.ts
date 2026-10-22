import { Logger } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import type { OtpProvider, OtpSendResult } from './otp-provider';

/**
 * Twilio Verify (https://www.twilio.com/docs/verify/api). Twilio generates, sends and
 * checks the code; we never see it. NOTE: not exercised end-to-end in this repo because
 * no credentials are available — validate in a staging environment before launch, and
 * confirm DLT template registration requirements for SMS in India.
 */
export class TwilioVerifyOtpProvider implements OtpProvider {
  readonly name = 'twilio_verify';
  private readonly logger = new Logger('TwilioVerify');

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly serviceSid: string,
  ) {}

  private headers() {
    return {
      Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }

  async send(phone: string): Promise<OtpSendResult> {
    const res = await fetch(`https://verify.twilio.com/v2/Services/${this.serviceSid}/Verifications`, {
      method: 'POST',
      headers: this.headers(),
      body: new URLSearchParams({ To: phone, Channel: 'sms' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      this.logger.error(`Twilio Verify send failed with HTTP ${res.status}`);
      throw AppError.unavailable('OTP_DELIVERY_FAILED', 'We could not send a code right now. Please try again.');
    }
    const body = (await res.json()) as { sid?: string };
    return { code: null, providerRef: body.sid ?? null, channel: 'sms' };
  }

  async check(phone: string, code: string): Promise<boolean> {
    const res = await fetch(`https://verify.twilio.com/v2/Services/${this.serviceSid}/VerificationCheck`, {
      method: 'POST',
      headers: this.headers(),
      body: new URLSearchParams({ To: phone, Code: code }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return false; // expired / already approved
    if (!res.ok) {
      this.logger.error(`Twilio Verify check failed with HTTP ${res.status}`);
      throw AppError.unavailable('OTP_VERIFY_FAILED', 'We could not verify the code right now. Please try again.');
    }
    const body = (await res.json()) as { status?: string };
    return body.status === 'approved';
  }
}
