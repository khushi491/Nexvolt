import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
    CORS_ORIGINS: z.string().default('http://localhost:3100,http://localhost:8081'),
    APP_VERSION: z.string().default('0.1.0'),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().default('redis://localhost:56379'),
    JOBS_ENABLED: bool,

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

    /** AES-256-GCM key (base64, 32 bytes) for field-level encryption of private address data. */
    PII_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'PII_ENCRYPTION_KEY must be 32 bytes base64'),

    OTP_PROVIDER: z.enum(['emulator', 'twilio_verify']).default('emulator'),
    OTP_HMAC_SECRET: z.string().min(32),
    /** Per-IP OTP request limit (DB-enforced). Raise only for automated test environments. */
    OTP_REQUESTS_PER_15MIN_PER_IP: z.coerce.number().int().min(1).max(10000).default(20),
    /** Skips per-route HTTP throttling so E2E suites from one IP aren't blocked. Forbidden in production. */
    DISABLE_ROUTE_THROTTLING_FOR_TESTS: bool,
    OTP_EMULATOR_FIXED_CODE: z
      .string()
      .regex(/^\d{6}$/)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_VERIFY_SERVICE_SID: z.string().optional(),

    /** Enables the DEMO payment adapter. Never allowed in production. */
    LOCAL_DEMO_MODE: bool,
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

    S3_ENDPOINT: z.string().optional(),
    S3_PUBLIC_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('ap-south-1'),
    S3_BUCKET: z.string().default('nexvolt-private'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool,
    S3_AUTO_CREATE_BUCKET: bool,

    FCM_PROJECT_ID: z.string().optional(),
    FCM_CLIENT_EMAIL: z.string().optional(),
    FCM_PRIVATE_KEY: z.string().optional(),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.LOCAL_DEMO_MODE) {
        ctx.addIssue({ code: 'custom', path: ['LOCAL_DEMO_MODE'], message: 'Demo mode is forbidden in production' });
      }
      if (env.OTP_PROVIDER === 'emulator') {
        ctx.addIssue({ code: 'custom', path: ['OTP_PROVIDER'], message: 'OTP emulator is forbidden in production' });
      }
      if (env.OTP_REQUESTS_PER_15MIN_PER_IP > 50) {
        ctx.addIssue({ code: 'custom', path: ['OTP_REQUESTS_PER_15MIN_PER_IP'], message: 'Relaxed OTP rate limits are not allowed in production' });
      }
      if (env.DISABLE_ROUTE_THROTTLING_FOR_TESTS) {
        ctx.addIssue({ code: 'custom', path: ['DISABLE_ROUTE_THROTTLING_FOR_TESTS'], message: 'Route throttling cannot be disabled in production' });
      }
      if (env.OTP_EMULATOR_FIXED_CODE) {
        ctx.addIssue({ code: 'custom', path: ['OTP_EMULATOR_FIXED_CODE'], message: 'Fixed OTP codes are forbidden in production' });
      }
    }
    if (env.OTP_PROVIDER === 'twilio_verify' && !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID)) {
      ctx.addIssue({ code: 'custom', path: ['OTP_PROVIDER'], message: 'Twilio Verify credentials are required' });
    }
    const rz = [env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET].filter(Boolean).length;
    if (rz > 0 && rz < 3) {
      ctx.addIssue({ code: 'custom', path: ['RAZORPAY_KEY_ID'], message: 'Set all of RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET' });
    }
    if (env.NODE_ENV !== 'production' && env.RAZORPAY_KEY_ID?.startsWith('rzp_live_')) {
      ctx.addIssue({ code: 'custom', path: ['RAZORPAY_KEY_ID'], message: 'Live Razorpay keys are only allowed with NODE_ENV=production' });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // Do not print values: they may be secrets.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export function env(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}

/** For tests only. */
export function resetEnvCache(): void {
  cached = undefined;
}

export const ENV = Symbol('ENV');
