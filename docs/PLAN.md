# Nexvolt — Implementation Plan

Working plan for the MVP. Each task ends with: typecheck + tests passing, this file updated, commit, push to `main`.
Status: ✅ done · 🔜 next · ⬜ not started · ⛔ blocked on external input

## Phase 0 — Foundation
| # | Task | Status |
|---|------|--------|
| 0.1 | Monorepo (pnpm workspaces), Docker Compose (PostGIS, Redis, S3), shared domain package + 40 unit tests | ✅ |
| 0.2 | Prisma schema (all entities), migrations with exclusion constraint / CHECKs / append-only audit trigger | ✅ |
| 0.3 | API core: env validation, JWT + RBAC guard, OTP auth (emulator + Twilio Verify), users, vehicles, hosts, documents (signed uploads), chargers, PostGIS search, availability, ledger reads, settings, health, Swagger, seed data | ✅ |

## Phase 1 — API: marketplace flows
| # | Task | Status |
|---|------|--------|
| 1.1 | Bookings: quote, create (idempotent, transactional hold), host approve/decline, cancel + refund policy, check-in, no-show, access reveal, events, receipt, host booking queue | ✅ |
| 1.2 | Payments: order creation, hosted checkout page (Razorpay + DEMO), signature verification, webhooks with dedupe/reordering, reconciliation, refunds, ledger posting | ✅ |
| 1.3 | Charging sessions: both-party start/end, meter readings + evidence, assessment → complete or auto-dispute, kWh settlement refund, ChargerAdapter (manual + OCPP stub) | ✅ |
| 1.4 | Reviews, favourites, support tickets, incidents (auto-suspend), disputes | ✅ |
| 1.5 | Admin API: overview, host KYC + charger approval queues, document review, suspensions, refunds, payouts, settings, audit log, CSV exports, privacy-safe geo overview, vehicle catalog | ✅ |
| 1.6 | BullMQ jobs: hold expiry, settlement, payment reconciliation, reminders, push delivery | ✅ |
| 1.7 | API integration tests (Supertest): double booking race, stale holds, webhook duplication/reordering, payout ledger, unauthorized access, geospatial search | ✅ |

## Phase 2 — Shared client + design system
| # | Task | Status |
|---|------|--------|
| 2.1 | `packages/api-client` typed client + OpenAPI export script | ✅ |
| 2.2 | Design tokens package (palette, type, spacing) | ✅ |

## Phase 3 — Web portal (Next.js, host + admin)
| # | Task | Status |
|---|------|--------|
| 3.1 | Scaffold Next.js + Tailwind + shadcn-style components, auth (OTP), layout/nav | ✅ |
| 3.2 | Host: onboarding, KYC upload, charger wizard + documents/photos, availability builder, booking queue, sessions, earnings | ✅ |
| 3.3 | Admin: overview, verification queues, users/chargers/bookings/payments, disputes, refunds, payouts, support, incidents, settings, audit, geo view | ✅ |
| 3.4 | Playwright E2E: happy path + negative paths | ✅ |

## Phase 4 — Mobile app (Expo)
| # | Task | Status |
|---|------|--------|
| 4.1 | Scaffold Expo Router app, theme + components, onboarding, OTP login + consent | ✅ |
| 4.2 | Driver: profile, vehicles, Explore (map/list, filters), charger detail | ✅ |
| 4.3 | Driver: booking flow, payment (WebView checkout), booking detail, navigation, session, receipt, review, support | ✅ |
| 4.4 | Host mode: dashboard, chargers, calendar, earnings, booking queue + meter readings | ✅ |
| 4.5 | React Native Testing Library tests | ✅ |

## Phase 5 — Docs, ops, hardening
| # | Task | Status |
|---|------|--------|
| 5.1 | README, ARCHITECTURE, DATABASE (ERD), API routes, DECISIONS & LIMITATIONS, feature inventory (complete / mocked / demo-only / future) | ✅ |
| 5.2 | India compliance checklist, security notes, backup & recovery | ✅ |
| 5.3 | API Dockerfile, AWS deployment guide, CI workflow, observability | ✅ |
| 5.4 | Final pass: format, typecheck, full test run, security review | 🔜 |

## External prerequisites (not code)
| Item | Needed for | Status |
|------|-----------|--------|
| Razorpay test key id/secret + webhook secret | Real sandbox payments (demo adapter used until then) | ⛔ |
| Twilio Verify credentials (+ DLT registration for India SMS) | Real OTP | ⛔ |
| Google Maps API key | Map display, geocoding | ⛔ |
| Firebase service account (+ APNs for iOS) | Push notifications | ⛔ |
| Legal, tax, payments-compliance and electrical-safety review | Any real launch | ⛔ |

## Notes
- 5.3: Added API/web container builds, AWS release/rollback and monitoring runbook, and GitHub Actions for typechecks, tests and image builds. Local Node 22 typechecks and all 118 tests pass; API container readiness checks pass against local infrastructure. AWS deployment and hosted CI require their respective environments.
- 1.2: Razorpay adapter (orders, capture, refunds, signature + webhook verification) is implemented against the documented REST API but has **not** been exercised against Razorpay sandbox — no test keys yet. All flows were verified end-to-end with the DEMO adapter.
