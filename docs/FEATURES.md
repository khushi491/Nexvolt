# Feature inventory

Legend: ✅ **Complete** (implemented and tested locally) · 🟡 **Mocked / adapter-ready** (code path exists, external provider not exercised) · 🧪 **Demo-only** (local development aid, refused in production) · 🔮 **Future**

## Driver (mobile)

| Feature | Status | Notes |
|---|---|---|
| Onboarding, OTP login, consent capture | ✅ / 🧪 OTP emulator | Real SMS via Twilio Verify is 🟡 |
| Profile, emergency contact, notification preferences | ✅ | Emergency phone encrypted at rest |
| Vehicles: catalog + manual connectors / AC / DC limits | ✅ | Catalog admin-maintained |
| Explore list, filters (radius, time window, compatibility, connector, AC/DC, power, price, parking, accessibility, verified meter) | ✅ | |
| Location permission + manual area search fallback | ✅ | Street geocoding 🔮 (Places key) |
| Map view with approximate pins | ✅ native / list-only on web | Store builds need Maps keys 🟡 |
| Charger detail, compatibility, policies, reviews, favourites, availability picker | ✅ | |
| Booking flow (quote, policies, idempotent reserve, manual-approval requests) | ✅ | |
| Payment via hosted checkout | 🧪 DEMO ✅ / 🟡 Razorpay | |
| Booking detail, address reveal near start, Google Maps navigation, check-in | ✅ | |
| Session confirmation with meter readings, estimate vs verified energy | ✅ | |
| Meter evidence photo from phone camera | 🔮 | API + web support evidence upload ✅ |
| Receipt, review, cancel with refund preview, dispute, support tickets, safety reports | ✅ | Receipt is not a GST invoice |
| Activity feed | ✅ | Push delivery 🟡 (FCM) |

## Host

| Feature | Status | Notes |
|---|---|---|
| Onboarding with authority + safety declarations | ✅ web | |
| Identity document upload → manual admin review | ✅ | Automated KYC 🔮 |
| Charger create/edit (private exact location, approximate public location, hardware, metering, pricing, access) | ✅ web | |
| Documents (property authorisation, society NOC, electrical safety, installation, calibration) | ✅ web | |
| Photos | ✅ web | |
| Weekly availability, exceptions/blackouts, buffer, min/max duration, approval mode | ✅ web | |
| Submit for review, publish/unpublish, pause/resume | ✅ web + mobile | |
| Booking queue: approve/decline, check-in, no-show, cancel, confirm session with readings | ✅ web + mobile | |
| Calendar (14-day agenda) | ✅ web + mobile | |
| Earnings ledger (gross, commission, fees, refunds; pending/eligible/in payout/paid) | ✅ web + mobile | |
| Payout account onboarding | 🟡 request recorded; admin verifies offline | Razorpay Route 🔮 |
| Smart charger / OCPP control | 🔮 | Adapter interface only |

## Admin / operations

| Feature | Status |
|---|---|
| Overview KPIs (GMV, commission recognised, cancellations, dispute ratio), demo-payment flag | ✅ |
| Verification queues (documents, host identity, chargers) with checklist | ✅ |
| Users & hosts, suspensions (sessions revoked), host payout-account status | ✅ |
| Chargers: review, suspend/reinstate; CRITICAL incident auto-suspend | ✅ |
| Bookings with timeline, payments + provider events, ledger; admin cancel + partial refund | ✅ |
| Payments & refunds lists | ✅ |
| Disputes: review and resolve (driver favour / host favour / split / reconciled kWh) | ✅ |
| Payouts: eligible balances → batch → mark paid with UTR / failed | ✅ (money moved outside the app) |
| Support tickets with internal notes; safety incidents | ✅ |
| Settings (validated, audited); audit log (append-only); CSV exports | ✅ |
| Geo overview (city aggregates of approximate points) | ✅ schematic / basemap 🔮 |
| Vehicle catalog management | ✅ API (UI 🔮) |
| Review moderation (hide) | ✅ API (UI 🔮) |

## Platform

| Feature | Status |
|---|---|
| RBAC + ownership checks, rate limiting, idempotency keys, signed uploads with magic-byte checks | ✅ |
| Webhook signature verification, dedupe, reordering safety, reconciliation jobs | ✅ (tested with fake Razorpay) |
| BullMQ jobs (hold expiry, settlement, reconciliation, reminders, push) | ✅ |
| OpenAPI spec + typed client | ✅ |
| Docker Compose local infra | ✅ |
| Dark mode, i18n | 🔮 |
| Production deployment | 🔮 documented in DEPLOYMENT.md, not provisioned |
