const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@nexvolt/shared', '@nexvolt/api-client', '@nexvolt/ui-tokens'],
  async headers() {
    const csp = [
      "default-src 'self'",
      // Next.js needs inline scripts for hydration; tighten with nonces before production.
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${new URL(API).origin} ${process.env.NEXT_PUBLIC_S3_ORIGIN ?? 'http://localhost:58333'} https://*.amazonaws.com https://maps.gstatic.com https://maps.googleapis.com`,
      `connect-src 'self' ${new URL(API).origin} ${process.env.NEXT_PUBLIC_S3_ORIGIN ?? 'http://localhost:58333'} https://*.amazonaws.com`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
