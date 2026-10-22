# Nexvolt — The Next Way to Charge

Peer-to-peer EV charging marketplace for India: drivers book verified private chargers shared by homeowners, apartment societies, businesses and parking operators; hosts earn from unused capacity; Nexvolt takes a configurable commission.

> **Status: working MVP — not production-ready.** It runs end-to-end locally with a DEMO payment adapter and an OTP emulator. Before any real launch it needs external security, legal, payments-compliance, tax and electrical-safety review, and real provider credentials. See [docs/DECISIONS.md](docs/DECISIONS.md) and [docs/COMPLIANCE.md](docs/COMPLIANCE.md). "Nexvolt" is a working brand only; no trademark or domain clearance has been done.

## What's in the repo

| Path                  | What                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`            | NestJS REST API (`/api/v1`), Prisma + PostgreSQL/PostGIS, Redis/BullMQ jobs, Swagger at `/api/docs`                                      |
| `apps/web`            | Next.js host & admin portal (Tailwind, shadcn-style components)                                                                          |
| `apps/mobile`         | Expo (SDK 58) React Native driver app + host mode                                                                                        |
| `packages/shared`     | Domain logic shared everywhere: enums, booking state machine, pricing/refunds/commission, availability, metering, zod schemas, DTO types |
| `packages/api-client` | Typed fetch client used by web and mobile                                                                                                |
| `packages/ui-tokens`  | Design tokens (WCAG-AA-checked colours) + Tailwind preset                                                                                |
| `infra/`              | Docker Compose for local Postgres/PostGIS, Redis, S3-compatible storage                                                                  |
| `docs/`               | Architecture, database/ERD, API reference, decisions & limitations, feature inventory, compliance, security, deployment, plan            |

## Quick start (local)

Prerequisites: Node **22.13+** (`nvm use` reads `.nvmrc`), pnpm 10, Docker.

```bash
pnpm install
pnpm infra:up                                   # Postgres+PostGIS :55432, Redis :56379, S3 (SeaweedFS) :58333
cp apps/api/.env.example apps/api/.env          # then generate the three secrets (see comments in the file)
cp apps/web/.env.example apps/web/.env.local
pnpm build:packages
pnpm --filter @nexvolt/api prisma:migrate       # applies migrations (incl. PostGIS + exclusion constraint)
pnpm --filter @nexvolt/api seed                 # FICTIONAL sample data
pnpm --filter @nexvolt/api build && pnpm --filter @nexvolt/api start     # API on :4000
pnpm --filter @nexvolt/web build && pnpm --filter @nexvolt/web start     # portal on :3100
cd apps/mobile && npx expo start                # mobile: Expo Go (iOS/Android) or press w for web
```

Ports are offset (55432/56379/58333/4000/3100) to avoid clashing with other local stacks.
On a physical phone the app derives the API URL from the Expo dev host (your machine's LAN IP); set `EXPO_PUBLIC_API_URL` to override, and set `S3_PUBLIC_ENDPOINT` in the API env to a LAN-reachable address if you test uploads from a phone.

### Demo accounts (local only)

With `OTP_PROVIDER=emulator` and `OTP_EMULATOR_FIXED_CODE=123456` no SMS is sent; any number accepts `123456`.

| Role                                | Phone       |
| ----------------------------------- | ----------- |
| Admin                               | 90000 00001 |
| Admin (used by API-level E2E setup) | 90000 00004 |
| Host (sample, verified)             | 90000 00002 |
| Driver (sample, Tata Nexon EV)      | 90000 00003 |

All seeded users, chargers and bookings are **fictional** and labelled **SAMPLE**; all local payments are labelled **DEMO PAYMENT**.

## Tests

```bash
pnpm -r test          # shared (40) + api-client (3) + ui-tokens (13) + API unit+integration (48, needs infra) + mobile RNTL (14, Node 22)
pnpm e2e              # Playwright: spec happy path + 7 negative paths against the running stack (see apps/web/playwright.config.ts)
```

API integration tests use a separate `nexvolt_test` database (created automatically) and refuse to run against any database not ending in `_test`. E2E needs the API running with `LOCAL_DEMO_MODE=true`, `OTP_REQUESTS_PER_15MIN_PER_IP=1000` and `DISABLE_ROUTE_THROTTLING_FOR_TESTS=true` (both rejected in production).

## Key documents

- [Architecture](docs/ARCHITECTURE.md) · [Database & ERD](docs/DATABASE.md) · [API reference](docs/API.md) (+ [OpenAPI](docs/openapi.json))
- [Decisions & limitations](docs/DECISIONS.md) · [Feature inventory](docs/FEATURES.md) · [Integrations & credentials](docs/INTEGRATIONS.md)
- [India compliance checklist](docs/COMPLIANCE.md) · [Security](docs/SECURITY.md) · [Deployment (AWS)](docs/DEPLOYMENT.md) · [Plan & progress](docs/PLAN.md)
