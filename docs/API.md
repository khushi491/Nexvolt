# API route reference

138 operations.
Generated from `docs/openapi.json` (regenerate with `pnpm --filter @nexvolt/api openapi`). Base path: `/api/v1`. Interactive docs at `/api/docs` when `NODE_ENV` is not production.

Conventions: bearer JWT auth unless noted public; money in integer paise; energy in integer Wh; timestamps ISO-8601 UTC; mutating payment/booking/session-completion/refund endpoints require an `Idempotency-Key` header. Errors: `{ statusCode, error, code, message, details?, requestId }`.

## admin

| Method | Path |
|---|---|
| GET | `/admin/audit-logs` |
| GET | `/admin/bookings` |
| GET | `/admin/bookings/{id}` |
| POST | `/admin/bookings/{id}/cancel` |
| GET | `/admin/chargers` |
| GET | `/admin/chargers/{id}` |
| POST | `/admin/chargers/{id}/decision` |
| POST | `/admin/chargers/{id}/reinstate` |
| POST | `/admin/chargers/{id}/suspend` |
| GET | `/admin/disputes` |
| POST | `/admin/disputes/{id}/resolve` |
| POST | `/admin/disputes/{id}/review` |
| GET | `/admin/documents` |
| POST | `/admin/documents/{id}/review` |
| GET | `/admin/exports/{type}` |
| GET | `/admin/geo` |
| GET | `/admin/hosts` |
| GET | `/admin/hosts/{id}` |
| POST | `/admin/hosts/{id}/kyc` |
| POST | `/admin/hosts/{id}/payout-account` |
| POST | `/admin/hosts/{id}/reinstate` |
| POST | `/admin/hosts/{id}/suspend` |
| GET | `/admin/incidents` |
| PATCH | `/admin/incidents/{id}` |
| POST | `/admin/maintenance/{task}` |
| GET | `/admin/overview` |
| GET | `/admin/payments` |
| GET | `/admin/payouts` |
| POST | `/admin/payouts` |
| GET | `/admin/payouts/eligible` |
| POST | `/admin/payouts/{id}/mark-failed` |
| POST | `/admin/payouts/{id}/mark-paid` |
| GET | `/admin/refunds` |
| POST | `/admin/refunds` |
| POST | `/admin/reviews/{id}/hide` |
| GET | `/admin/settings` |
| PUT | `/admin/settings/{key}` |
| GET | `/admin/support/tickets` |
| PATCH | `/admin/support/tickets/{id}` |
| GET | `/admin/users` |
| POST | `/admin/users/{id}/reinstate` |
| POST | `/admin/users/{id}/suspend` |
| GET | `/admin/vehicle-models` |
| POST | `/admin/vehicle-models` |
| PUT | `/admin/vehicle-models/{id}` |

## auth

| Method | Path |
|---|---|
| POST | `/auth/logout` |
| POST | `/auth/otp/request` |
| POST | `/auth/otp/verify` |
| POST | `/auth/refresh` |
| POST | `/auth/terms` |

## bookings

| Method | Path |
|---|---|
| POST | `/bookings` |
| GET | `/bookings` |
| GET | `/bookings/host` |
| POST | `/bookings/quote` |
| GET | `/bookings/{id}` |
| GET | `/bookings/{id}/access` |
| POST | `/bookings/{id}/approve` |
| POST | `/bookings/{id}/cancel` |
| GET | `/bookings/{id}/cancellation-preview` |
| POST | `/bookings/{id}/check-in` |
| POST | `/bookings/{id}/decline` |
| GET | `/bookings/{id}/events` |
| POST | `/bookings/{id}/no-show` |
| GET | `/bookings/{id}/receipt` |

## chargers

| Method | Path |
|---|---|
| POST | `/chargers` |
| GET | `/chargers/mine` |
| PATCH | `/chargers/{id}` |
| GET | `/chargers/{id}` |
| PUT | `/chargers/{id}/availability` |
| GET | `/chargers/{id}/availability` |
| POST | `/chargers/{id}/exceptions` |
| DELETE | `/chargers/{id}/exceptions/{exceptionId}` |
| GET | `/chargers/{id}/manage` |
| POST | `/chargers/{id}/pause` |
| POST | `/chargers/{id}/photos` |
| DELETE | `/chargers/{id}/photos/{photoId}` |
| POST | `/chargers/{id}/photos/{photoId}/complete` |
| POST | `/chargers/{id}/publish` |
| POST | `/chargers/{id}/resume` |
| GET | `/chargers/{id}/reviews` |
| POST | `/chargers/{id}/submit` |
| POST | `/chargers/{id}/unpublish` |

## charging-sessions

| Method | Path |
|---|---|
| GET | `/charging-sessions/{bookingId}` |
| POST | `/charging-sessions/{bookingId}/complete` |
| POST | `/charging-sessions/{bookingId}/end` |
| POST | `/charging-sessions/{bookingId}/evidence` |
| POST | `/charging-sessions/{bookingId}/evidence/{evidenceId}/complete` |
| GET | `/charging-sessions/{bookingId}/evidence/{evidenceId}/url` |
| POST | `/charging-sessions/{bookingId}/start` |

## disputes

| Method | Path |
|---|---|
| POST | `/disputes` |
| GET | `/disputes/mine` |

## documents

| Method | Path |
|---|---|
| GET | `/documents` |
| POST | `/documents/uploads` |
| DELETE | `/documents/{id}` |
| POST | `/documents/{id}/complete` |
| GET | `/documents/{id}/url` |

## favorites

| Method | Path |
|---|---|
| GET | `/favorites` |
| PUT | `/favorites/{chargerId}` |
| DELETE | `/favorites/{chargerId}` |

## health

| Method | Path |
|---|---|
| GET | `/health` |
| GET | `/health/live` |

## hosts

| Method | Path |
|---|---|
| GET | `/hosts/me` |
| PATCH | `/hosts/me` |
| GET | `/hosts/me/earnings` |
| POST | `/hosts/me/kyc/submit` |
| GET | `/hosts/me/ledger` |
| POST | `/hosts/me/payout-onboarding` |
| GET | `/hosts/me/payouts` |
| POST | `/hosts/onboard` |

## incidents

| Method | Path |
|---|---|
| POST | `/incidents` |
| GET | `/incidents/mine` |

## notifications

| Method | Path |
|---|---|
| GET | `/notifications` |
| POST | `/notifications/read-all` |
| POST | `/notifications/{id}/read` |

## payments

| Method | Path |
|---|---|
| GET | `/payments/booking/{bookingId}` |
| POST | `/payments/demo/complete` |
| POST | `/payments/orders` |
| POST | `/payments/verify` |

## reviews

| Method | Path |
|---|---|
| POST | `/reviews` |
| GET | `/reviews/host` |
| GET | `/reviews/mine` |
| POST | `/reviews/{id}/reply` |

## search

| Method | Path |
|---|---|
| GET | `/search/chargers` |

## support

| Method | Path |
|---|---|
| POST | `/support/tickets` |
| GET | `/support/tickets` |
| GET | `/support/tickets/{id}` |
| POST | `/support/tickets/{id}/messages` |

## users

| Method | Path |
|---|---|
| GET | `/users/me` |
| PATCH | `/users/me` |
| POST | `/users/me/deletion-request` |
| POST | `/users/me/devices` |
| DELETE | `/users/me/devices` |

## vehicles

| Method | Path |
|---|---|
| GET | `/vehicles` |
| POST | `/vehicles` |
| GET | `/vehicles/catalog` |
| PATCH | `/vehicles/{id}` |
| DELETE | `/vehicles/{id}` |

## webhooks

| Method | Path |
|---|---|
| POST | `/webhooks/razorpay` |

