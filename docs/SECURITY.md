# Security

Not externally assessed. This documents the controls implemented and what remains before production.

## Controls implemented

**Authentication & sessions**
- Phone OTP: codes HMAC-SHA256-hashed with a server secret (never stored plain), 5-minute expiry, 30 s resend cooldown, 5 requests/phone/15 min, per-IP limit, 5 wrong attempts lock the challenge (attempt counted atomically before checking), consumed once. Emulator and fixed codes are refused in production.
- Access JWT (HS256, 15 min, issuer/audience checked, algorithm pinned). Refresh tokens: 48-byte random, stored as SHA-256, rotated on each use; reuse of a rotated token revokes the whole family.
- Web: refresh token only in an `httpOnly`, `SameSite=Strict`, path-scoped cookie set by same-origin route handlers that also check `Origin`. Mobile: OS keychain/keystore (SecureStore). Access tokens in memory only.
- The user is reloaded on every request: suspension or role removal is effective immediately; suspension also revokes refresh tokens.

**Authorisation**
- Global guard: every route is authenticated unless explicitly `@Public()`. `@Roles()` for role checks; ownership checks in services (bookings return 404 rather than 403 to non-participants to avoid confirming existence). SUPPORT staff can read operations data but cannot change verification, money or settings; only ADMIN can cancel bookings on the platform's behalf.
- Client-side route guards are UX only.

**Input, output & uploads**
- All bodies/queries validated with zod (unknown fields stripped by schema); UUID params validated.
- Errors are normalised; no stack traces, SQL or secrets in responses.
- Uploads: allow-listed MIME types and sizes, server-generated object keys, short-lived presigned PUT/GET (5 / 10 min), private bucket, server-side size + magic-byte verification after upload (object deleted on mismatch). Display file names are sanitised.
- CSV exports neutralise formula injection.

**Payments**
- Amounts always computed server-side. Checkout signature (HMAC of `order_id|payment_id`) verified with constant-time compare, then the payment is re-fetched from the provider. Webhooks: HMAC over the raw body, event-id dedupe, payload sanitised (no card, VPA, email or phone stored), state re-fetched from the provider. Forward-only status precedence. Amount/currency mismatch blocks confirmation. Live keys refused outside production; partial credentials refused.

**Data protection**
- AES-256-GCM field encryption (random IV, auth tag) for exact address lines, access instructions and emergency contact phone; key from env/secret manager.
- Approximate public locations (one-time random offset); phones masked in lists and to hosts; exact address revealed only to the confirmed driver close to start and audited.
- Logs: pino with redaction of authorization, cookies, signatures and idempotency keys; request bodies not logged; OTP emulator logs codes only in development.

**Abuse & integrity**
- Route throttling (in-memory per instance) on OTP, search, booking, payment and support endpoints; DB-backed OTP limits; max 3 open holds per driver; idempotency keys on booking, payment-order, session completion and admin refunds.
- Database invariants (exclusion constraint, unique/partial indexes, CHECKs) and append-only audit log (trigger).
- Security headers: helmet on the API; CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy on the portal; nonce-based CSP on the hosted checkout page.

## Before production

- [ ] External penetration test and code review; threat model sign-off.
- [ ] Move route throttling to Redis storage (multi-instance); add WAF (AWS WAF) rate rules and bot protection on OTP.
- [ ] Tighten portal CSP (nonces instead of `'unsafe-inline'`).
- [ ] Secrets in AWS Secrets Manager with rotation; `PII_ENCRYPTION_KEY` key versioning + re-encryption job; consider KMS envelope encryption.
- [ ] Admin MFA (e.g. TOTP/WebAuthn) and IP allow-listing for the admin portal; shorter admin session lifetime.
- [ ] Dependency scanning (Dependabot/Renovate, `pnpm audit`), container image scanning, SAST in CI.
- [ ] Malware scanning of uploaded files (e.g. S3 → Lambda + AV) before reviewers open them.
- [ ] Monitoring/alerting for auth anomalies, webhook signature failures, refund failures.
- [ ] Mobile: certificate pinning decision, jailbreak/root policy, release signing via EAS.
- [ ] Data-retention and deletion workflows (see COMPLIANCE.md).

## Backups & recovery

| Asset | Backup | Target |
|---|---|---|
| PostgreSQL (RDS) | Automated daily snapshots (35-day retention) + point-in-time recovery; cross-region snapshot copy weekly; deletion protection on | RPO ≤ 5 min (PITR), RTO ≤ 2 h |
| S3 private bucket | Versioning + lifecycle (non-current versions 90 days), cross-region replication optional, Object Lock (governance) for KYC docs if required by retention policy | RPO ≈ 0 |
| Redis | Not a system of record (queues/jobs re-derive state from Postgres); AOF on | Rebuild |
| Secrets | Secrets Manager (versioned, replicated to a second region) | — |
| Infrastructure | IaC (to be written: Terraform/CDK) in git | Re-provision |

**Restore procedure (database):** 1) Declare incident, freeze writes (scale API to 0 / maintenance mode). 2) Restore RDS to a new instance at the chosen point in time. 3) Run `prisma migrate deploy` (should be a no-op) and sanity queries: row counts, latest `audit_logs`, `payments` vs provider dashboard. 4) Point the API's `DATABASE_URL` secret at the restored instance; scale up. 5) Run `reconcile-payments` and `reconcile-refunds` maintenance tasks to re-sync with Razorpay for the gap window. 6) Post-incident review.

**Test restores quarterly** into an isolated environment and record time-to-restore.

## Reporting vulnerabilities

Until a security contact exists, report privately to the repository owner. Do not open public issues for vulnerabilities.
