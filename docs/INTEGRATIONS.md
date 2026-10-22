# Integrations & credentials

Never commit secrets. Locally use `apps/api/.env` (git-ignored); in AWS use Secrets Manager / SSM Parameter Store; for mobile store builds use EAS secrets. The API validates configuration at boot and refuses unsafe combinations in production (demo payments, OTP emulator, fixed OTP code, relaxed rate limits, live Razorpay keys outside production, partial credentials).

| Integration | Needed for | Env / config | Status in this repo |
|---|---|---|---|
| **Razorpay** (test mode first) | Orders, Checkout (UPI/cards/netbanking), capture, refunds, webhooks | `RAZORPAY_KEY_ID` (`rzp_test_…`), `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Webhook URL: `https://<api>/api/v1/webhooks/razorpay`, events `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed` | Implemented, tested with an in-memory fake; **not yet run against sandbox** |
| Razorpay Route / marketplace settlement | Automated host payouts | Separate onboarding + linked accounts | Not used; payouts are admin-managed |
| **Twilio Verify** | Real OTP SMS | `OTP_PROVIDER=twilio_verify`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`; DLT registration for India | Implemented, not exercised |
| **Firebase Cloud Messaging** | Push notifications | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (service account); Android `google-services.json` + iOS APNs key for builds | Implemented (HTTP v1), not exercised; tokens registered only in dev/store builds |
| **Google Maps Platform** | Store-build maps, Places search | `GOOGLE_MAPS_ANDROID_API_KEY`, `GOOGLE_MAPS_IOS_API_KEY` (app.config.ts); a Places key for address search | Maps work in Expo Go without keys; Places not implemented |
| **AWS S3** | Private document/photo/evidence storage | `S3_REGION`, `S3_BUCKET`, IAM role (no static keys) ; leave `S3_ENDPOINT` unset | Local SeaweedFS works; S3 config documented |
| KYC provider (e.g. DigiLocker / licensed eKYC) | Automated identity verification | — | Future |
| OCPP CSMS | Remote start/stop, live meter values | — | Future; `ChargerAdapter` interface ready |

## Turning on Razorpay sandbox

1. Create a Razorpay account, switch to **Test mode**, generate API keys.
2. Add a webhook pointing at your API (use a tunnel such as `cloudflared` locally) with the events above and a secret.
3. Set the three env vars, set `LOCAL_DEMO_MODE=false`, restart the API. `GET /api/v1/health` shows `payments: configured`.
4. Pay with Razorpay's test UPI ID / test cards in the hosted checkout. Verify the booking confirms via **both** the checkout callback and the webhook, and that `admin/payments` shows provider fee and events.
