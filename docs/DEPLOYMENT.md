# AWS deployment runbook

The MVP is not cleared for a real launch. Complete the external prerequisites in
[PLAN.md](PLAN.md), the [compliance checklist](COMPLIANCE.md), and the
[security and recovery procedures](SECURITY.md) before accepting real bookings.
This is an operator runbook; it does not provision resources or deploy on push.

## Topology

Use a single AWS region (for example Mumbai, `ap-south-1`), an ECS Fargate cluster,
and separate API and web services behind an HTTPS Application Load Balancer.
Route the API hostname to port 4000 and the portal hostname to port 3100. Only
the load balancer may reach task ports; only API tasks may reach PostgreSQL and
Redis. Keep tasks, RDS PostgreSQL and ElastiCache Redis in private subnets, with
outbound connectivity for payment, SMS, push and AWS APIs. Enable PostGIS and
btree_gist through the checked-in Prisma migrations using a migration role with
extension permissions. Use encrypted RDS storage, automated backups and PITR.
Redis needs TLS (`rediss://`), authentication and a no-eviction policy for BullMQ.

Create a private S3 bucket with Block Public Access, encryption, versioning and a
reviewed retention policy. Configure bucket CORS for the portal's exact HTTPS
origin, PUT/GET/HEAD methods and Content-Type / x-amz-* headers needed by signed
uploads. Expose ETag. Do not allow anonymous object access. API task IAM needs
ListBucket on this bucket and GetObject/PutObject/DeleteObject on its objects.
Use the ECS task role credential chain; omit static S3 access keys and endpoints.
The task execution role separately needs ECR pulls, log delivery and permission
to retrieve the task definition's Secrets Manager secrets.

## Images and configuration

Build from the repository root and publish immutable commit tags to private ECR
repositories. The images run as non-root users. Match the image architecture to
the ECS runtime platform (build with `--platform linux/amd64` for x86_64 tasks).

```sh
docker build --platform linux/amd64 -f apps/api/Dockerfile -t nexvolt-api:COMMIT .
docker build --platform linux/amd64 -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.in \
  --build-arg NEXT_PUBLIC_S3_ORIGIN=https://BUCKET.s3.ap-south-1.amazonaws.com \
  -t nexvolt-web:COMMIT .
```

The public web variables are baked into the bundle and CSP; rebuild for each
environment. Set `API_INTERNAL_URL` at runtime to a reachable API base URL
(without `/api/v1`) for the portal's server-side session routes. It can use the
HTTPS API hostname. Set web `PORT=3100` and `HOSTNAME=0.0.0.0`.

Inject API configuration using task environment variables and Secrets Manager:

| Setting                                                             | Deployment value                                                                         |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `NODE_ENV`, `PORT`, `APP_VERSION`                                   | `production`, `4000`, deployed commit                                                    |
| `API_PUBLIC_URL`, `CORS_ORIGINS`                                    | HTTPS API URL, exact portal origin (comma-separated if needed)                           |
| `DATABASE_URL`, `REDIS_URL`                                         | Private database with TLS and Redis TLS connection strings                               |
| `JWT_ACCESS_SECRET`, `OTP_HMAC_SECRET`                              | Independent random secrets of at least 32 characters                                     |
| `PII_ENCRYPTION_KEY`                                                | Base64-encoded 32-byte key; preserve it with recoverable backups                         |
| `OTP_PROVIDER`                                                      | `twilio_verify`, with all three Twilio credentials from `.env.example` / `config/env.ts` |
| `LOCAL_DEMO_MODE`, `DISABLE_ROUTE_THROTTLING_FOR_TESTS`             | `false`; omit `OTP_EMULATOR_FIXED_CODE`                                                  |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | All three provider credentials                                                           |
| `JOBS_ENABLED`                                                      | `true` on the API service so maintenance and notification jobs run                       |
| `S3_REGION`, `S3_BUCKET`                                            | Region and pre-created private bucket                                                    |
| `S3_FORCE_PATH_STYLE`, `S3_AUTO_CREATE_BUCKET`                      | `false`                                                                                  |
| `LOG_LEVEL`                                                         | `info`                                                                                   |
| `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`             | Push provider credentials if enabled                                                     |

Do not deploy the local `.env`, seed data or Compose credentials. Production
validation rejects demo payments, emulator OTPs and disabled throttling. Missing
payment credentials still disable payments; verify health integration status.

## Release and rollback

1. Run CI, review the diff and push image tags to ECR. CI checks type safety,
   unit/integration tests and both image builds; it does not deploy.
2. Back up the database and check migration compatibility with the running API.
   Run one ECS task using the **new API image**, its network and secrets, with
   command `node_modules/.bin/prisma migrate deploy`. Wait for exit code zero.
   Never run development migrations, reset or seed against production.
3. Register new task definition revisions with the immutable image digests.
   Update services with deployment circuit breaker and rollback enabled. Allow
   sufficient health check grace and draining time; retain the old revisions.
4. Check `/api/v1/health/live` (process liveness) and `/api/v1/health`
   (database, Redis and S3 readiness). The latter returns HTTP 200 even when
   degraded: a synthetic check must inspect `status === "ok"` and each check.
   Use `/login` for the web target group's health check. Verify provider status,
   OTP, signed uploads, payment webhook delivery and background job processing
   in an approved test account before opening traffic.
5. On application failure, restore the previous task revision. ECS rollback does
   not undo database migrations. Use forward fixes for schema changes; restore
   a database backup only under the recovery procedure with reconciliation of
   payments and ledger entries. Never blindly reverse financial migrations.

AWS documents [ECS rolling deployments and failure detection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html).

## Observability

Send task stdout/stderr to CloudWatch Logs using `awslogs`, with encryption,
restricted access and explicit retention. The API already emits Pino JSON,
request IDs, HTTP status and duration; it redacts authorization/cookie/payment
signature/idempotency headers and suppresses routine health access logs. Keep
production at `info`; never add request bodies, OTPs or payment secrets to logs.
Logs are operational telemetry, not a substitute for the append-only audit log.

Alarm on ALB 5xx and latency, zero healthy targets, ECS restarts/failed deployments,
CPU/memory, RDS connections/storage, Redis memory/evictions and failed synthetic
readiness checks. Alert on BullMQ failures and stalled jobs, overdue payment
reconciliation, refund failures and webhook errors. Queue/financial alerts need
operator-configured polling or log metric filters; no hosted dashboard, tracing
backend or Prometheus exporter is supplied. Route alarms to an owned on-call
destination and rehearse both dependency outages and backup restoration.
