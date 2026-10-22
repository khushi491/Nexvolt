import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { ENV, type Env } from '../../config/env';
import { AppError } from '../../common/errors/app-error';

const UPLOAD_URL_TTL_S = 300;
const DOWNLOAD_URL_TTL_S = 600;

/** Magic-byte signatures for allowed MIME types. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
};

export function matchesSignature(mimeType: string, head: Buffer): boolean {
  const check = SIGNATURES[mimeType];
  return !!check && check(head);
}

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresInSeconds: number;
}

/**
 * Private object storage. Buckets are never public; clients upload with short-lived
 * presigned PUT URLs and read via short-lived presigned GET URLs. After upload the
 * server verifies size and magic bytes before the file is accepted.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('Storage');
  private readonly client: S3Client | null;
  private readonly presignClient: S3Client | null;
  readonly bucket: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.bucket = env.S3_BUCKET;
    const configured = !!(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) || !env.S3_ENDPOINT;
    const base = {
      region: env.S3_REGION,
      // Presigned PUTs are signed before the body exists; SDK default checksums would embed the
      // checksum of an empty payload and make every client upload fail.
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined,
    };
    this.client = configured ? new S3Client({ ...base, endpoint: env.S3_ENDPOINT }) : null;
    this.presignClient = configured
      ? new S3Client({ ...base, endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT })
      : null;
  }

  get enabled(): boolean {
    return !!this.client && !!(this.env.S3_ACCESS_KEY_ID || !this.env.S3_ENDPOINT);
  }

  async onModuleInit(): Promise<void> {
    if (!this.client || !this.env.S3_AUTO_CREATE_BUCKET) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created private bucket ${this.bucket}`);
      } catch (e) {
        this.logger.warn(`Object storage unavailable: ${(e as Error).message}`);
      }
    }
  }

  private requireClient(): S3Client {
    if (!this.client || !this.presignClient) {
      throw AppError.unavailable(
        'STORAGE_NOT_CONFIGURED',
        'File uploads are not configured on this server',
      );
    }
    return this.client;
  }

  newKey(prefix: string, mimeType: string): string {
    const ext =
      { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[
        mimeType
      ] ?? 'bin';
    return `${prefix}/${randomUUID()}.${ext}`;
  }

  async presignUpload(key: string, mimeType: string, sizeBytes: number): Promise<PresignedUpload> {
    this.requireClient();
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
      ContentLength: sizeBytes,
      ServerSideEncryption: this.env.S3_ENDPOINT ? undefined : 'AES256',
    });
    const uploadUrl = await getSignedUrl(this.presignClient!, cmd, { expiresIn: UPLOAD_URL_TTL_S });
    return {
      key,
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      expiresInSeconds: UPLOAD_URL_TTL_S,
    };
  }

  async presignDownload(key: string): Promise<string | null> {
    if (!this.presignClient) return null;
    return getSignedUrl(
      this.presignClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: DOWNLOAD_URL_TTL_S },
    );
  }

  /** Verify an uploaded object: exists, size matches declaration, magic bytes match MIME. Deletes on failure. */
  async verifyUpload(
    key: string,
    mimeType: string,
    maxBytes: number,
  ): Promise<{ ok: boolean; sizeBytes: number; reason?: string }> {
    const client = this.requireClient();
    let size = 0;
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      size = head.ContentLength ?? 0;
    } catch {
      return { ok: false, sizeBytes: 0, reason: 'File was not uploaded' };
    }
    const fail = async (reason: string) => {
      await client
        .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
        .catch(() => undefined);
      return { ok: false, sizeBytes: size, reason };
    };
    if (size <= 0 || size > maxBytes) return fail('File size is not allowed');
    const obj = await client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: 'bytes=0-15' }),
    );
    const bytes = Buffer.from(await obj.Body!.transformToByteArray());
    if (!matchesSignature(mimeType, bytes)) return fail('File content does not match its type');
    return { ok: true, sizeBytes: size };
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
