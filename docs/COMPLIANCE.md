# India compliance checklist

> **This is a checklist for review by qualified professionals — not legal, tax or engineering advice, and not a statement that Nexvolt complies with anything.** Laws, rules and guidelines change; every item must be confirmed against the current official text by the appropriate advisor before launch. Nothing in the product asserts regulatory approval.

Owner legend: **L** legal counsel · **T** tax/CA · **P** payments/gateway · **E** licensed electrical engineer / contractor · **I** insurer · **Pr** product/engineering.

## 1. Electrical safety & installation

| ✔ | Item | Owner | Product support today |
|---|---|---|---|
| ☐ | Confirm applicable safety requirements for private and shared EV supply equipment (e.g. Central Electricity Authority safety regulations and any EV-charging amendments; relevant IS/IEC standards for AC/DC chargers and connectors) | E, L | Host declaration; electrical safety certificate upload is mandatory before verification |
| ☐ | Define what documents prove a safe installation (licensed contractor certificate, protection devices such as RCD/RCBO, earthing test, cable sizing, charger certification) and how often they must be renewed | E | Document types exist; renewal/expiry tracking is **future** |
| ☐ | Decide whether portable "15A socket" charging may be listed, and with what limits | E, L | Connector type supported; policy decision pending |
| ☐ | Fire-safety requirements for chargers in basements/parking (building codes, society rules, local fire authority) | E, L | Parking type captured; no automated check |
| ☐ | Emergency procedure: what drivers/hosts must do on fire, shock or injury; escalation SLAs for Nexvolt staff | L, Pr | Safety reports with 112 guidance; CRITICAL reports auto-suspend the charger and alert admins |
| ☐ | Site inspection policy (none today — approval is document-based) | E, Pr | Future |

## 2. Authority to offer charging and parking

| ✔ | Item | Owner | Product support today |
|---|---|---|---|
| ☐ | What proves a host may offer charging + parking (ownership, lease terms, landlord consent, apartment society/RWA NOC, commercial premises permissions) | L | Property authorisation / society NOC upload required before verification |
| ☐ | Society bylaws on shared/common-area electricity and visitor parking | L | Captured via NOC; not validated automatically |
| ☐ | Municipal / zoning / trade-licence implications of hosts earning from parking + charging | L, T | Not addressed |

## 3. Ministry of Power & state EV-charging rules

| ✔ | Item | Owner | Product support today |
|---|---|---|---|
| ☐ | Review the Ministry of Power guidelines for installation and operation of EV charging infrastructure (current edition) — including whether a peer-to-peer host is a "public charging station", and any licensing, registration or reporting requirements | L | Not assumed either way |
| ☐ | State EV policies and state electricity regulatory commission orders (EV tariff categories, connection types, registration with the DISCOM) for each launch state | L | Charger `state` captured |
| ☐ | Whether domestic connections may be used to sell charging to third parties under the host's tariff category | L | Hourly pricing default; kWh pricing disabled |

## 4. Electricity resale, tariffs & metering

| ✔ | Item | Owner | Product support today |
|---|---|---|---|
| ☐ | Whether charging is treated as a service rather than electricity sale for these hosts, and conditions attached (e.g. licensing exemptions, tariff ceilings) | L | `kwhPricingEnabled=false` by default; hourly pricing is billed for time/parking, not energy |
| ☐ | Price caps or tariff ceilings that may apply to per-kWh charging | L | Admin price min/max limits exist for both units |
| ☐ | **Meter accuracy and calibration requirements** before any energy-based billing: acceptable meter types/accuracy class, calibration certificate validity, tamper evidence, legal-metrology implications | E, L | Per-kWh only for chargers with an admin-accepted calibration certificate; both-party readings, tolerance + plausibility checks, disputes; bills the lower agreed reading |
| ☐ | Tolerance, plausibility headroom and dispute rules sign-off | E, Pr | Configurable settings (defaults: 100 Wh / 2 %, 5 % headroom) |

## 5. Tax, invoicing & payments

| ✔ | Item | Owner | Product support today |
|---|---|---|---|
| ☐ | GST treatment of: host charging/parking fees, Nexvolt commission, driver service fee; place of supply; invoice requirements (who issues invoices, to whom) | T | Receipts are explicitly **not tax invoices**; service-fee tax rate configurable (default 0) |
| ☐ | E-commerce operator obligations (e.g. GST TCS and income-tax TDS for e-commerce operators) and host registration thresholds | T | Not implemented; ledger has the data needed |
| ☐ | Payment aggregation model: who collects funds, holding periods, settlement to hosts — confirm against RBI payment aggregator/gateway rules and the gateway's marketplace product | P, L | Funds collected via Razorpay; host payouts admin-managed; no escrow claims |
| ☐ | KYC/AML obligations for hosts receiving payouts (PAN/bank verification, beneficial ownership for businesses), and for the platform | P, L | Manual identity review; no bank data stored; payout account status set by admin |
| ☐ | Refund timelines and chargeback handling per gateway terms | P | Refunds via provider API, reconciled; chargebacks not modelled |
| ☐ | UPI-specific requirements via the gateway | P | Through Razorpay Checkout once configured |

## 6. Data protection & privacy

| ✔ | Item | Owner | Product support today |
|---|---|---|---|
| ☐ | Digital Personal Data Protection Act 2023 and its Rules: lawful basis/consent notices, purpose limitation, retention, data principal rights (access, correction, erasure, grievance), breach notification, children's data, any Significant Data Fiduciary implications | L | Versioned consent captured at sign-up; deletion request recorded; data minimisation (masked phones in lists, approximate locations, encrypted address fields) |
| ☐ | Privacy notice and consent text (placeholders today) | L | `termsVersion` recorded per user |
| ☐ | Retention schedule for bookings, payments, KYC documents, meter evidence, audit logs | L, T | Not automated |
| ☐ | Cross-border data transfer (cloud region, sub-processors: gateway, SMS, push, maps) | L | Deploy in `ap-south-1` (Mumbai) per DEPLOYMENT.md |
| ☐ | Location data handling (driver GPS used client-side for search; not stored) | L | Search coordinates are not persisted |
| ☐ | Grievance officer / contact and response timelines (IT Act intermediary rules, consumer e-commerce rules) | L | Support tickets exist; officer details not in product |

## 7. Terms, liability, consumer protection & insurance

| ✔ | Item | Owner | Product support today |
|---|---|---|---|
| ☐ | Terms of service for drivers and hosts (platform role, liability for vehicle/property damage, injury, charger faults) | L | Draft placeholders only |
| ☐ | Cancellation and refund policy wording and fairness (consumer protection e-commerce rules) | L | Three policies with clear tiers shown before booking |
| ☐ | Price display requirements (all-inclusive price, fee breakdown) | L | Itemised breakdown; total shown before payment |
| ☐ | Insurance: platform liability, host property/public liability, vehicle damage during charging | I, L | None |
| ☐ | Dispute resolution process and SLAs | L, Pr | Admin dispute workflow with audit trail |
| ☐ | Accessibility commitments | Pr | WCAG-AA colour tokens, labels, 48 pt targets; no formal audit |

## 8. Platform governance

| ✔ | Item | Owner | Product support today |
|---|---|---|---|
| ☐ | Verification standard operating procedure for reviewers (what to check, how to record) | Pr, L | Approval checklist enforced server-side; reasons audit-logged |
| ☐ | Trademark and domain clearance for the brand | L | Not done — working brand only |
| ☐ | Security assessment and penetration test before launch | Pr | See SECURITY.md |
