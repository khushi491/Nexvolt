/** Test environment. Uses a dedicated database so dev data is never touched. Values are test-only. */
const base =
  process.env.TEST_DATABASE_URL ??
  'postgresql://nexvolt:nexvolt_local_only@localhost:55432/nexvolt_test?schema=public';
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: base,
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:56379',
  JOBS_ENABLED: 'false',
  JWT_ACCESS_SECRET: 'test-only-jwt-secret-0123456789abcdef0123456789',
  PII_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  OTP_PROVIDER: 'emulator',
  OTP_HMAC_SECRET: 'test-only-otp-secret-0123456789abcdef0123456789',
  OTP_EMULATOR_FIXED_CODE: '123456',
  LOCAL_DEMO_MODE: 'true',
  RAZORPAY_KEY_ID: '',
  RAZORPAY_KEY_SECRET: '',
  RAZORPAY_WEBHOOK_SECRET: '',
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:58333',
  S3_ACCESS_KEY_ID: 'nexvolt_local',
  S3_SECRET_ACCESS_KEY: 'nexvolt_local_secret',
  S3_FORCE_PATH_STYLE: 'true',
  S3_REGION: 'us-east-1',
  LOG_LEVEL: 'silent',
});
