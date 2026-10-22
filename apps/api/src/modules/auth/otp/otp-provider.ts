/**
 * Pluggable OTP delivery. Real providers own code generation/verification
 * (e.g. Twilio Verify) or deliver a server-generated code via SMS.
 */
export interface OtpSendResult {
  /** Server-generated code to hash and store (null when the provider owns the code). */
  code: string | null;
  providerRef: string | null;
  channel: 'sms' | 'emulator';
}

export interface OtpProvider {
  readonly name: string;
  send(phoneE164: string): Promise<OtpSendResult>;
  /** Only for providers that own the code. */
  check?(phoneE164: string, code: string, providerRef: string | null): Promise<boolean>;
}

export const OTP_PROVIDER = Symbol('OTP_PROVIDER');
