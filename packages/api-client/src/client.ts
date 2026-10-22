import type { ApiErrorBody, AuthResponse } from '@nexvolt/shared';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.message ?? `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code ?? 'UNKNOWN';
    this.details = body.details;
    this.requestId = body.requestId;
  }
}

export interface TokenStore {
  getAccessToken(): string | null | Promise<string | null>;
  getRefreshToken(): string | null | Promise<string | null>;
  setTokens(auth: AuthResponse): void | Promise<void>;
  clear(): void | Promise<void>;
}

export interface ClientOptions {
  /** e.g. http://localhost:4000 (no trailing /api/v1). */
  baseUrl: string;
  tokens?: TokenStore;
  fetch?: typeof fetch;
  /** Called when the session cannot be refreshed (show login). */
  onSessionExpired?: () => void;
  /**
   * Custom refresh (e.g. a same-origin route that holds the refresh token in an httpOnly
   * cookie). Returns the new access token, or null when the session is over.
   */
  refresh?: () => Promise<string | null>;
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Adds an Idempotency-Key header. Pass a stable key to make retries safe. */
  idempotencyKey?: string | true;
  auth?: boolean;
  signal?: AbortSignal;
}

function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function newIdempotencyKey(): string {
  return uuid();
}

/** Low-level HTTP client with bearer auth and single-flight token refresh. */
export class HttpClient {
  private refreshing: Promise<boolean> | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ClientOptions) {
    this.fetchImpl = opts.fetch ?? ((...args) => fetch(...args));
  }

  get baseUrl(): string {
    return this.opts.baseUrl.replace(/\/$/, '');
  }

  url(path: string, query?: Query): string {
    const qs = query
      ? Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    return `${this.baseUrl}/api/v1${path}${qs ? `?${qs}` : ''}`;
  }

  async request<T>(method: string, path: string, o: RequestOptions = {}): Promise<T> {
    const idemKey = o.idempotencyKey === true ? uuid() : o.idempotencyKey;
    const send = async (): Promise<Response> => {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (o.body !== undefined) headers['Content-Type'] = 'application/json';
      if (idemKey) headers['Idempotency-Key'] = idemKey;
      if (o.auth !== false && this.opts.tokens) {
        const t = await this.opts.tokens.getAccessToken();
        if (t) headers.Authorization = `Bearer ${t}`;
      }
      return this.fetchImpl(this.url(path, o.query), {
        method,
        headers,
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
        signal: o.signal,
      });
    };
    let res = await send();
    if (res.status === 401 && o.auth !== false && this.opts.tokens && (await this.refresh())) res = await send();
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      if (res.status === 401) this.opts.onSessionExpired?.();
      throw new ApiError(res.status, (json as Partial<ApiErrorBody>) ?? {});
    }
    return json as T;
  }

  /** Text responses such as CSV exports. */
  async text(path: string, query?: Query): Promise<string> {
    const headers: Record<string, string> = {};
    const t = await this.opts.tokens?.getAccessToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await this.fetchImpl(this.url(path, query), { headers });
    if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))) as Partial<ApiErrorBody>);
    return res.text();
  }

  private refresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        try {
          if (this.opts.refresh) {
            const access = await this.opts.refresh();
            if (!access) await this.opts.tokens?.clear();
            return !!access;
          }
          const rt = await this.opts.tokens?.getRefreshToken();
          if (!rt) return false;
          const res = await this.fetchImpl(this.url('/auth/refresh'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt }),
          });
          if (!res.ok) {
            await this.opts.tokens?.clear();
            return false;
          }
          await this.opts.tokens?.setTokens((await res.json()) as AuthResponse);
          return true;
        } catch {
          return false;
        } finally {
          setTimeout(() => (this.refreshing = null), 0);
        }
      })();
    }
    return this.refreshing;
  }
}

/** Upload a file to a presigned URL returned by the API. */
export async function uploadToPresignedUrl(
  upload: { uploadUrl: string; headers: Record<string, string> },
  body: Blob | ArrayBuffer | Uint8Array,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(upload.uploadUrl, { method: 'PUT', headers: upload.headers, body: body as BodyInit });
  if (!res.ok) throw new ApiError(res.status, { code: 'UPLOAD_FAILED', message: 'File upload failed. Please try again.' });
}
