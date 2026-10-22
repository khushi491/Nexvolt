# Architecture

## System overview

```mermaid
flowchart LR
  subgraph Clients
    M[Mobile app<br/>Expo / React Native<br/>driver + host mode]
    W[Web portal<br/>Next.js<br/>host + admin]
  end
  subgraph API["NestJS API (/api/v1)"]
    G[Global guards<br/>JWT + RBAC + throttling]
    MOD[Modules: auth, users, vehicles, hosts, documents,<br/>chargers/search, bookings, payments/webhooks,<br/>sessions, reviews, favourites, support, admin, ledger]
    J[BullMQ workers<br/>hold expiry, settlement,<br/>reconciliation, reminders, push]
  end
  PG[(PostgreSQL 16<br/>+ PostGIS)]
  R[(Redis)]
  S3[(S3-compatible<br/>private bucket)]
  RZP[Razorpay<br/>Orders / Checkout / Webhooks]
  OTP[Twilio Verify<br/>or local emulator]
  FCM[Firebase Cloud Messaging]
  GM[Google Maps<br/>deep links / map tiles]

  M -- HTTPS JSON --> G
  W -- "same-origin BFF (httpOnly refresh cookie)" --> G
  G --> MOD --> PG
  MOD --> R
  J --> R
  J --> PG
  MOD -- presigned URLs --> S3
  M -. direct upload/download via presigned URL .-> S3
  W -. direct upload/download via presigned URL .-> S3
  MOD <--> RZP
  RZP -- signed webhooks --> MOD
  MOD --> OTP
  J --> FCM
  M --> GM
```

## Principles

- **The server decides.** Payment success, booking state, availability, pricing and authorisation are computed server-side. Clients never report "paid"; checkout callbacks are signature-verified and the payment is re-fetched from the provider.
- **One state machine.** `packages/shared/src/booking-state-machine.ts` defines every allowed booking transition and which actor type may trigger it. All status changes in the API go through `BookingTransitionsService`, which applies compare-and-set on `(id, status, version)` and writes an immutable `BookingStatusEvent`.
- **Database-enforced invariants.** No double booking (GiST exclusion constraint over `[startAt, blockedUntil)` for capacity-holding statuses), one live payment per booking (partial unique index), CHECK constraints on money and durations, append-only audit log (trigger). Application checks exist for friendly errors; the database is the guarantee.
- **Integer money and energy.** Paise and Wh everywhere; basis points for rates. No floats in billing.
- **Privacy by default.** Public APIs expose an approximate location (random 200–500 m offset generated once and stored). Exact address and access instructions are AES-256-GCM encrypted at rest and revealed only to the confirmed driver near start time (audited), the host and staff.
- **Honest UI.** No fake telemetry, no remote start/stop, estimates labelled as estimates, DEMO payments and SAMPLE listings labelled everywhere.

## Booking lifecycle

```mermaid
stateDiagram-v2
  [*] --> AWAITING_HOST_APPROVAL: driver requests (manual approval)
  [*] --> HELD: driver reserves (automatic approval)
  AWAITING_HOST_APPROVAL --> HELD: host approves
  AWAITING_HOST_APPROVAL --> CANCELLED: host declines / driver withdraws
  AWAITING_HOST_APPROVAL --> EXPIRED: no response
  HELD --> PENDING_PAYMENT: payment order created
  HELD --> EXPIRED: hold timeout
  PENDING_PAYMENT --> CONFIRMED: verified capture (SYSTEM only)
  PENDING_PAYMENT --> EXPIRED: payment window ends
  PENDING_PAYMENT --> FAILED
  EXPIRED --> CONFIRMED: late verified payment, slot still free
  EXPIRED --> FAILED: late payment, slot taken → auto refund
  CONFIRMED --> CHECKED_IN: arrival (driver/host)
  CONFIRMED --> CANCELLED: policy refund
  CONFIRMED --> NO_SHOW: host after grace
  CHECKED_IN --> CHARGING: start confirmed
  CHARGING --> COMPLETED: both confirm end, readings agree
  CHARGING --> DISPUTED: meter discrepancy / implausible
  COMPLETED --> SETTLED: dispute window closes → earnings eligible
  COMPLETED --> DISPUTED
  DISPUTED --> COMPLETED: admin resolves (host favour / split)
  DISPUTED --> CANCELLED: admin resolves (driver favour, full refund)
```

`AVAILABLE` from the product brief is a property of a slot, not a booking row. `AWAITING_HOST_APPROVAL` was added for hosts who approve manually; drivers pay only after approval.

Holds expire consistently in two places: lazily inside every booking-creation transaction for the affected charger (so a stale hold never blocks a new booking) and every minute by a BullMQ job.

## Payment flow

```mermaid
sequenceDiagram
  participant App as Mobile / Web
  participant API
  participant RZP as Razorpay (or DEMO)
  App->>API: POST /bookings (Idempotency-Key) → HELD
  App->>API: POST /payments/orders (Idempotency-Key)
  API->>RZP: create order (amount = server-side total)
  API-->>App: checkoutUrl (hosted page, payment-scoped 20-min token)
  App->>RZP: Checkout (UPI / card / netbanking) in WebView / tab
  RZP-->>App: handler(order_id, payment_id, signature)
  App->>API: POST /payments/checkout/verify
  API->>API: verify HMAC(order|payment, key_secret)
  API->>RZP: GET /payments/:id (source of truth)
  API->>API: applyProviderPayment(): forward-only status, capture if authorised,<br/>CONFIRMED / revive / auto-refund, post host ledger
  RZP-)API: webhook payment.captured (HMAC over raw body, event-id dedupe)
  API->>RZP: re-fetch payment → same idempotent apply (no double effects)
```

Reconciliation jobs poll Razorpay for payments stuck in CREATED/AUTHORIZED and refunds stuck in PENDING, so a lost webhook or closed app still converges.

## Metering & sessions

There is **no hardware integration** in this release. `ChargerAdapter` (`apps/api/src/modules/sessions/adapters`) defines the boundary for a future OCPP integration; every charger uses `ManualMeterAdapter`, which refuses remote start/stop and live readings. Sessions are confirmed by both parties; for per-kWh bookings both must enter start/end readings. The shared `assessReadings()` compares deltas against a tolerance (max of absolute Wh and a percentage) and a physical plausibility ceiling (max power × duration + headroom). Agreement bills the **lower** reading; anything else opens a `METER_DISCREPANCY` dispute and holds the payout.

## Money: ledger and payouts

Host earnings are an append-only ledger with deterministic idempotency keys (`capture:<paymentId>:<TYPE>`, `refund:<refundId>:<TYPE>`), so retries cannot double-post.

`PENDING` (booking not settled) → `ELIGIBLE` (dispute window passed — owed, **not paid**) → `IN_PAYOUT` (admin batched it) → `PAID_OUT` (admin recorded a bank UTR / provider reference). Automated split settlement (e.g. Razorpay Route) is not used because it needs separate merchant onboarding; payouts are admin-managed and never shown as paid without a reference.

## Auth & sessions

Phone OTP (Twilio Verify in production, local emulator in development — refused in production). Codes are HMAC-hashed; per-phone/per-IP DB limits, resend cooldown and attempt lockout. Access tokens: 15-min HS256 JWT. Refresh tokens: opaque, SHA-256-hashed in the DB, rotated on every use with family-wide revocation on reuse. Web keeps the refresh token in an httpOnly SameSite=Strict cookie via Next.js route handlers; mobile keeps it in the OS keychain (SecureStore). Every request reloads the user, so suspensions take effect immediately.

## Code map (API)

| Module | Responsibility |
|---|---|
| `common/` | env validation, Prisma, JWT guard + `@Roles`, errors/filter, audit, idempotency, crypto, Redis |
| `auth`, `users` | OTP providers, tokens, profile, devices, deletion request |
| `vehicles`, `hosts`, `documents`, `storage` | catalog + vehicles, host onboarding/KYC submission, signed uploads with magic-byte checks |
| `chargers` | host CRUD, availability, PostGIS search, public detail, mappers |
| `booking-core`, `bookings` | transitions/holds, quote/create/approve/cancel/check-in/no-show/access/receipt |
| `payments` | provider registry (Razorpay/DEMO), orders, checkout page, verification, webhooks, refunds |
| `sessions` | both-party confirmation, readings, evidence, completion, kWh settlement |
| `ledger` | host ledger, earnings summary, payouts |
| `reviews`, `favorites`, `support` | reviews, favourites, tickets, incidents (auto-suspend), disputes |
| `admin` | verification queues, moderation, finance, disputes, settings, audit, exports, geo |
| `jobs` | BullMQ schedulers and push delivery |
