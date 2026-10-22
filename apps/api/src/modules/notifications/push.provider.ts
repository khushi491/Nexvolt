import { Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';
import type { Env } from '../../config/env';

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushProvider {
  readonly enabled: boolean;
  send(msg: PushMessage): Promise<'sent' | 'invalid_token' | 'failed' | 'disabled'>;
}

/**
 * Firebase Cloud Messaging HTTP v1 using a service account (no SDK dependency).
 * Requires FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY. Not exercised end-to-end
 * in this repo without credentials. iOS delivery additionally needs APNs configured in Firebase.
 */
export class FcmPushProvider implements PushProvider {
  private readonly logger = new Logger('FCM');
  private token: { value: string; exp: number } | null = null;

  constructor(private readonly env: Env) {}

  get enabled(): boolean {
    return !!(this.env.FCM_PROJECT_ID && this.env.FCM_CLIENT_EMAIL && this.env.FCM_PRIVATE_KEY);
  }

  private async accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.token.exp - 60 > now) return this.token.value;
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(
      JSON.stringify({
        iss: this.env.FCM_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    ).toString('base64url');
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    const sig = signer.sign(this.env.FCM_PRIVATE_KEY!.replace(/\\n/g, '\n')).toString('base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${sig}` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`FCM auth failed: HTTP ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, exp: now + body.expires_in };
    return body.access_token;
  }

  async send(msg: PushMessage) {
    if (!this.enabled) return 'disabled' as const;
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.env.FCM_PROJECT_ID}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token: msg.token, notification: { title: msg.title, body: msg.body }, data: msg.data } }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404 || res.status === 400) return 'invalid_token' as const;
      return res.ok ? ('sent' as const) : ('failed' as const);
    } catch (e) {
      this.logger.warn(`Push failed: ${(e as Error).message}`);
      return 'failed' as const;
    }
  }
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
