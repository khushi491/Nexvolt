# Staging deployment: Vercel, Render, AWS S3, and Expo

**Superseded for the current free demo:** follow [the free deployment runbook](DEPLOYMENT-FREE.md).
The root `render.yaml` now creates only a free API service. The paid resource
descriptions below are a reference for a future paid setup and do not describe
the current Blueprint.

This runbook deploys an isolated staging environment for testing admin, host, and
customer flows. It does not enable real bookings or constitute production launch.
The existing [AWS production runbook](DEPLOYMENT.md) remains available separately.

## Accounts and prerequisites

- GitHub repository: `https://github.com/khushi491/Nexvolt`.
- Vercel for `apps/web`; Render for API, PostgreSQL and Redis.
- AWS for a dedicated private S3 staging bucket.
- Expo for the customer web deployment; native store builds can follow later.
- Twilio Verify for OTP delivery to your test phones.
- Razorpay **test-mode** credentials and a separate test webhook secret for payment tests.

Use Node 22.19.0 (`nvm use`) and pnpm 10.13.1. Never upload `.env` files or reuse
local Compose passwords, fictional demo accounts, or production secrets.

The Render Blueprint requests paid resources: one API instance, persistent Redis,
and PostgreSQL. Review its current estimate in Render before creating resources.
Use Singapore for the Render services and Mumbai (`ap-south-1`) for S3 initially;
consider the cross-region transfer and latency when selecting final regions.

## 1. Reserve the application URLs

1. Import the repository into Vercel. Set Root Directory to `apps/web`, Framework
   to Next.js, Node to 22.x, and enable inclusion of files outside the Root Directory.
   The checked-in `apps/web/vercel.json` installs workspace dependencies and builds
   shared packages before the portal. Reserve a stable project URL for staging.
2. Create/link an Expo project for `apps/mobile` and reserve a stable customer URL.
   Do not point preview builds at production services.
3. Use the API's actual Render HTTPS URL once allocated. Do not assume the service
   name guarantees an available subdomain. Update `API_PUBLIC_URL` before testing
   any checkout URLs.

Use the three exact HTTPS origins below in subsequent steps (no `/api/v1` suffix):

| Setting  | Example only                               |
| -------- | ------------------------------------------ |
| Portal   | `https://nexvolt-staging.vercel.app`       |
| API      | `https://nexvolt-staging-api.onrender.com` |
| Customer | `https://nexvolt-staging.expo.app`         |

## 2. Configure AWS S3

The prepared CloudFormation template `infra/staging-storage.cfn.yml` creates the
bucket, exact-origin CORS rules, an HTTPS-only bucket policy, and a bucket-scoped
IAM user. In the AWS CloudFormation console, select Mumbai (`ap-south-1`), upload
this template, supply the portal and customer origins, review the resources and
IAM capability acknowledgement, then create a staging stack. The bucket is
retained if the stack is deleted. The template creates no access keys and outputs
the bucket name, bucket origin, and IAM user name. Create a programmatic access
key for that user through IAM and save the two values only in Render.

Alternatively, configure these resources manually:

Create a uniquely named staging bucket with Block Public Access enabled,
encryption (SSE-S3), and versioning. Keep it private. Give a dedicated staging IAM
principal only `s3:ListBucket` on this bucket and `s3:GetObject`, `s3:PutObject`, and
`s3:DeleteObject` on its objects. Render needs this principal's access key and
secret; never use AWS root credentials. Store them only in Render's secret settings.

Replace both example origins in `infra/s3-cors.staging.json` with your actual portal
and customer origins, then apply the CORS configuration through the S3 console or:

```sh
aws s3api put-bucket-cors --bucket YOUR-STAGING-BUCKET \
  --cors-configuration file://infra/s3-cors.staging.json
```

Native clients do not need a browser CORS origin. Explicitly add any approved
browser preview origins; avoid wildcards. CORS does not grant public object access.

## 3. Create the Render Blueprint

In Render, choose New Blueprint, connect the repository, and use root `render.yaml`.
If using the deployment preparation branch before merging, select that branch
explicitly so Render can find the new Blueprint.
Keep the repository root as Docker build context. Review resource plans and cost.
The Blueprint creates:

- Node 22 API from `apps/api/Dockerfile`, with one instance and jobs enabled.
- PostgreSQL 16 accessible only over Render's private network.
- Persistent Key Value storage with `noeviction`, accessible only internally.
- A pre-deploy `prisma migrate deploy` command, which must pass before API startup.
  Migrations create `postgis`, `btree_gist`, and `pgcrypto`, plus booking constraints.

Fill the prompted secrets and settings:

| API variable                               | Staging value                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `API_PUBLIC_URL`                           | Actual Render HTTPS API origin                                          |
| `CORS_ORIGINS`                             | Portal and customer HTTPS origins, comma-separated                      |
| `PII_ENCRYPTION_KEY`                       | Generate with `openssl rand -base64 32`; preserve securely for recovery |
| `TWILIO_ACCOUNT_SID`                       | Twilio account SID                                                      |
| `TWILIO_AUTH_TOKEN`                        | Twilio auth token                                                       |
| `TWILIO_VERIFY_SERVICE_SID`                | Twilio Verify service SID                                               |
| `S3_BUCKET`                                | Private staging bucket name                                             |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Dedicated bucket-scoped staging IAM keys                                |

The Blueprint generates independent JWT and OTP HMAC secrets. Do not regenerate
the PII key after storing encrypted data. Database and Redis URLs are wired from
the private services. Keep `S3_REGION` aligned with the bucket. Leave
`S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, and `OTP_EMULATOR_FIXED_CODE` unset.

The API runs with `NODE_ENV=production` for hosted staging, so demo payments,
emulated OTPs, and disabled throttling are rejected. Twilio trial accounts may
require verifying test recipients first. Login requires working SMS delivery.

Payment credentials are intentionally not mandatory Blueprint prompts, so the
API can start before payment onboarding. In the API's environment settings add
all three together before testing bookings:

```text
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=<test key secret>
RAZORPAY_WEBHOOK_SECRET=<test webhook secret>
```

Configure a Razorpay **test-mode** webhook to
`https://YOUR-API/api/v1/webhooks/razorpay`. Subscribe to the payment and refund
events required by the integration (payment authorization/capture/failure and
refund status changes). Verify event delivery and signature handling with test
transactions. The current provider uses the same REST adapter for test keys;
hosted payment behavior still requires live integration verification.

The Render health probe checks `/api/v1/health/live`. Independently inspect
`/api/v1/health`: HTTP 200 alone is insufficient; `status` and each dependency
check must be `ok`. `push` and `maps` can remain unconfigured for initial staging.

Do not run `db:reset` or the fictional seed against this database. Check backups
are enabled and take a backup before subsequent schema migrations.

## 4. Deploy the portal on Vercel

Set the following variables on the staging Vercel project, including any approved
Preview deployment scope. Vercel calls its main deployment scope Production;
this project still connects only to staging infrastructure.

```text
NEXT_PUBLIC_API_URL=https://YOUR-API
API_INTERNAL_URL=https://YOUR-API
NEXT_PUBLIC_S3_ORIGIN=https://YOUR-STAGING-BUCKET.s3.ap-south-1.amazonaws.com
```

Deploy and verify `/login` loads. Public variables and security headers are baked
into the build: changing them requires a new deployment. API secrets belong on
Render and must never use a `NEXT_PUBLIC_` prefix.

## 5. Deploy the customer web app

From the repository root:

```sh
nvm use
pnpm install --frozen-lockfile
pnpm build:packages
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init
EXPO_PUBLIC_API_URL=https://YOUR-API pnpm exec expo export --platform web
npx eas-cli@latest deploy
```

The app already uses `web.output: single`, supported by EAS Hosting. Follow the
CLI project-linking prompts; save the real Expo project ID rather than inventing
one. The API URL is public and embedded at export time. Export again after any
change. Test a preview first; use `npx eas-cli@latest deploy --prod` to publish to
the stable URL of this **staging Expo project** after verification. Add the actual
preview origin to API and bucket CORS while testing, then use the stable origin.

Keep Expo hosting protection enabled while doing initial setup where supported.
The customer app can also run locally against this hosted API. Native Android/iOS
builds, signing, identifiers, Maps keys, and store submission are a later milestone.

## 6. Provision the first admin

Register your own phone through real OTP in the customer app and accept consent.
Use the Render service shell (which can reach the private database) to open a
PostgreSQL session, or use Render's authenticated PSQL tooling. The API image does
not include the `psql` client, so use a private-network database client when needed.
Do not expose the database to `0.0.0.0/0` for this step.

Run `infra/bootstrap-admin.sql` with `psql` against the intended staging database.
It prompts for a registered E.164 phone, refuses sample/inactive users and any
database already containing an admin, and records the grant in the audit log.
For example, from a private-network operator environment with `DATABASE_URL` set:

```sh
psql "$DATABASE_URL" -f infra/bootstrap-admin.sql
```

If using an external operator workstation, temporarily allow only its public IP
on Render Postgres, use the external TLS connection URL supplied by Render, then
remove that access immediately. Avoid putting credentials in shell history.

Sign out and log in again to receive the new role. The host registers separately
and completes host onboarding; the admin reviews host and charger verification.
Do not automatically approve test hosts or fabricate real charger listings.

## 7. Validate all three roles

Run the read-only deployment check from the repository root:

```sh
node scripts/check-deployment.mjs \
  --api https://YOUR-API \
  --portal https://YOUR-PORTAL \
  --customer https://YOUR-CUSTOMER
```

This checks dependency readiness, configured providers, page availability, and
API CORS for both frontends. It does not prove provider credentials work or test
authenticated flows. Hosting access protection may require testing in an
authenticated browser instead of this unauthenticated check.

Manually verify:

1. Customer OTP, consent, vehicle setup, search, and charger detail.
2. Host onboarding, private document upload, charger creation and availability.
3. Admin review/approval; customer cannot access admin or other users' records.
4. Booking, Razorpay test checkout, webhook processing, host booking handling,
   cancellation/refund, and background job execution.
5. Session refresh, logout, page reloads and direct customer route navigation.
6. Uploaded objects remain inaccessible without a valid signed URL.

## 8. Updates and rollback

Render's Blueprint uses `autoDeployTrigger: checksPass`; API changes deploy after
the linked branch's CI succeeds. Vercel Git integration creates frontend builds
and previews. Customer exports are manual until the Expo project and credentials
are configured; then add an authenticated EAS workflow separately.

Do not assume independent frontend/API deployments are ordered. Keep API changes
backwards-compatible, or deploy manually in API-then-client order. Preview sites
must use staging services and exact CORS allowlists.

On failure, restore the previous API deployment and client deployments. Database
migrations are not undone by application rollback; use compatible forward fixes
and the backup/recovery process. Keep the prior encryption key recoverable.

## Provider references

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render PostgreSQL extensions](https://render.com/docs/postgresql-extensions)
- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Expo EAS Hosting deployment](https://docs.expo.dev/eas/hosting/get-started/)
