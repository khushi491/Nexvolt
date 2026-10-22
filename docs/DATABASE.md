# Database

PostgreSQL 16 + PostGIS 3.4, managed with Prisma (`apps/api/prisma/schema.prisma`). Things Prisma can't express live in hand-written SQL in `prisma/migrations/20261020000100_spatial_and_integrity`.

Conventions: UUID primary keys; all timestamps `timestamptz` in UTC (display in IST at the edge); money in integer **paise**; energy in integer **Wh** (meter readings stored as `numeric(12,3)` kWh as entered, converted to Wh for billing); rates in basis points; snake_case plural table names with camelCase columns; enum values identical to `packages/shared/src/enums.ts` (unit-tested).

## ERD

```mermaid
erDiagram
  User ||--o| DriverProfile : has
  User ||--o| HostProfile : "may be"
  User ||--o{ Vehicle : owns
  User ||--o{ RefreshToken : sessions
  User ||--o{ DeviceToken : push
  User ||--o{ Booking : "books (driver)"
  User ||--o{ Review : writes
  User ||--o{ Favorite : saves
  User ||--o{ Notification : receives
  User ||--o{ SupportTicket : raises
  User ||--o{ IncidentReport : reports
  User ||--o{ AuditLog : "acts in"
  VehicleModel ||--o{ Vehicle : "catalog for"
  Vehicle ||--o{ VehicleConnector : accepts
  HostProfile ||--o{ Charger : lists
  HostProfile ||--o{ VerificationDocument : uploads
  HostProfile ||--o{ HostLedgerEntry : earns
  HostProfile ||--o{ Payout : "is paid"
  Charger ||--o{ ChargerConnector : has
  Charger ||--o{ ChargerPhoto : shows
  Charger ||--o{ VerificationDocument : "evidenced by"
  Charger ||--o{ ChargerVerification : "reviewed in"
  Charger ||--o{ ChargerAvailabilityRule : "open on"
  Charger ||--o{ AvailabilityException : "closed/custom on"
  Charger ||--o{ Booking : "booked as"
  Charger ||--o{ Review : rated
  Charger ||--o{ IncidentReport : "subject of"
  Booking ||--o{ BookingStatusEvent : history
  Booking ||--o{ BookingHold : holds
  Booking ||--o| ChargingSession : "charged in"
  Booking ||--o{ Payment : "paid by"
  Booking ||--o{ Refund : refunded
  Booking ||--o{ HostLedgerEntry : posts
  Booking ||--o| Review : "reviewed by"
  Booking ||--o{ Dispute : disputed
  ChargingSession ||--o{ MeterReading : records
  MeterReading ||--o{ MeterEvidence : "photo of"
  Payment ||--o{ PaymentEvent : "webhooks for"
  Payment ||--o{ Refund : "refunded via"
  Payout ||--o{ HostLedgerEntry : batches
  SupportTicket ||--o{ SupportMessage : thread

  User {
    uuid id PK
    text phone UK "E.164"
    enum_array roles "DRIVER, HOST, ADMIN, SUPPORT"
    UserStatus status
    timestamptz consentAcceptedAt
    jsonb notificationPrefs
    bool isSample
  }
  HostProfile {
    uuid id PK
    uuid userId FK,UK
    KycStatus kycStatus "VERIFIED only via admin"
    PayoutAccountStatus payoutAccountStatus
    timestamptz suspendedAt
  }
  Charger {
    uuid id PK
    uuid hostId FK
    ChargerStatus status
    bool isPublished
    text addressLine1 "AES-GCM"
    geography location "PRIVATE"
    geography publicLocation "approx"
    PricingUnit pricingUnit
    int unitPriceMinor
    timestamptz meterVerifiedAt
  }
  Booking {
    uuid id PK
    text code UK
    uuid driverId FK
    uuid chargerId FK
    BookingStatus status
    timestamptz startAt
    timestamptz blockedUntil "endAt+buffer"
    int totalMinor
    int commissionBps
    text idempotencyKey
    int version
  }
  Payment {
    uuid id PK
    uuid bookingId FK
    PaymentProviderName provider
    bool isDemo
    text providerOrderId UK
    text providerPaymentId UK
    PaymentStatus status
    int amountMinor
    int amountRefundedMinor
    text idempotencyKey UK
  }
  PaymentEvent {
    uuid id PK
    text dedupeKey UK "provider event id"
    jsonb payload "sanitised"
    bool signatureVerified
    timestamptz processedAt
  }
  Refund {
    uuid id PK
    uuid paymentId FK
    int amountMinor
    int chargingFeePortionMinor
    RefundStatus status
    text idempotencyKey UK
  }
  HostLedgerEntry {
    uuid id PK
    uuid hostId FK
    LedgerEntryType type
    LedgerEntryStatus status
    int amountMinor "signed"
    text idempotencyKey UK
  }
  Payout {
    uuid id PK
    uuid hostId FK
    int amountMinor
    PayoutStatus status
    text externalReference "required for PAID"
  }
  ChargingSession {
    uuid id PK
    uuid bookingId FK,UK
    SessionStatus status
    int durationMinutes
    int meteredEnergyWh "verified only"
    jsonb assessment
  }
  MeterReading {
    uuid id PK
    uuid sessionId FK
    MeterPhase phase
    numeric readingKwh
    ActorType recordedByRole
  }
  AuditLog {
    uuid id PK
    uuid actorId FK
    text action
    text resourceType
    text reason
    jsonb oldValue
    jsonb newValue
  }
```

Supporting tables not shown above: `otp_challenges`, `idempotency_records`, `platform_settings`, `support_messages`, `disputes`, `charger_verifications`, `vehicle_models`.

## Integrity rules enforced by the database

| Rule                                                                                                 | Mechanism                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No overlapping capacity on a charger (holds and confirmed bookings alike, including the host buffer) | `EXCLUDE USING gist ("chargerId" WITH =, tstzrange("startAt","blockedUntil",'[)') WITH &&) WHERE status IN (AWAITING_HOST_APPROVAL, HELD, PENDING_PAYMENT, CONFIRMED, CHECKED_IN, CHARGING)` |
| Contending inserts don't deadlock                                                                    | per-charger `pg_advisory_xact_lock` in the booking transaction                                                                                                                               |
| At most one live payment per booking                                                                 | partial unique index on `payments("bookingId") WHERE status IN (AUTHORIZED, CAPTURED, PARTIALLY_REFUNDED)`                                                                                   |
| Totals add up; no negative money                                                                     | CHECK `totalMinor = chargingFee + serviceFee + serviceFeeTax`, amounts ≥ 0, refunded ≤ amount                                                                                                |
| A payout can't be PAID without a bank/provider reference                                             | CHECK on `payouts`                                                                                                                                                                           |
| A charger can't be VERIFIED without an approval timestamp, or published unless VERIFIED              | CHECKs on `chargers`                                                                                                                                                                         |
| A host can't be identity-VERIFIED without a timestamp                                                | CHECK on `host_profiles`                                                                                                                                                                     |
| One open dispute per booking                                                                         | partial unique index                                                                                                                                                                         |
| Audit log is append-only                                                                             | `BEFORE UPDATE OR DELETE` trigger raising an error                                                                                                                                           |
| Webhook events processed once                                                                        | unique `payment_events.dedupeKey`                                                                                                                                                            |
| Ledger postings idempotent                                                                           | unique `host_ledger_entries.idempotencyKey`                                                                                                                                                  |
| Booking creation idempotent per driver                                                               | unique `(driverId, idempotencyKey)`                                                                                                                                                          |

## Spatial

`chargers.location` (exact, private) and `chargers.publicLocation` (approximate, public) are `geography(Point,4326)` with GiST indexes. Search uses `ST_DWithin(publicLocation, point, radius)` with KNN ordering `publicLocation <-> point`. Distances shown to drivers are to the approximate point and labelled approximate. The admin geo view aggregates public coordinates by city only.

## Migrations

`prisma migrate dev` reports drift because PostGIS creates its own tables in `public`. Generate SQL with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <empty PostGIS database> --script` into a new migration folder and apply with `prisma migrate deploy` (also what CI/production run).
