import { Logger } from '@nestjs/common';
import { maskPhone } from '@nexvolt/shared';
import { randomInt } from 'node:crypto';
import type { OtpProvider, OtpSendResult } from './otp-provider';

/**
 * LOCAL DEVELOPMENT ONLY. Sends nothing. Generates a code and prints it to the API log
 * (or uses OTP_EMULATOR_FIXED_CODE). Env validation refuses this provider in production.
 */
export class EmulatorOtpProvider implements OtpProvider {
  readonly name = 'emulator';
  private readonly logger = new Logger('OtpEmulator');

  constructor(private readonly fixedCode?: string) {}

  async send(phone: string): Promise<OtpSendResult> {
    const code = this.fixedCode ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.logger.warn(`[DEV OTP EMULATOR — no SMS sent] ${maskPhone(phone)} → ${code}`);
    return { code, providerRef: null, channel: 'emulator' };
  }
}
