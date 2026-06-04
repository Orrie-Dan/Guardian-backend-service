# API v1 — Changelog and breaking changes

All routes remain under `/api/v1`.

> **Billing phases 1–6:** deploy checklist, flows, and frontend integration → [../billing-overhaul-implementation.md](../billing-overhaul-implementation.md)

## Registration v2 (breaking)

**Removed** monolithic registration:

| Removed | Replacement |
|---------|-------------|
| `POST /auth/register` | `POST /auth/register/start` → `start/verify` → PATCH steps → `submit` |
| `POST /auth/register/verify-phone/request` | Phone OTP at start |
| `POST /auth/register/verify-phone/confirm` | `POST /auth/register/submit` |
| `POST /auth/register/otp/*` | Removed (were 410) |

**Added**

- `PATCH /auth/register/profile`, `business`, `payment`, `location`
- `GET /auth/register/status`
- `POST /auth/register/resume`
- `POST /organizations/:id/locations/primary/complete-site`

**Behavior**

- Onboarding JWT: `purpose: onboarding`, 7-day TTL.
- Registration location: no user lat/lon; district centroid server-side.
- `canBookJobs`: org `VERIFIED` **and** primary location `USER_PINNED`.
- Admin org reject requires `reason` in body.

See [onboarding.md](onboarding.md).

## Auth error codes (additions)

| Code | When |
|------|------|
| `ONBOARDING_INCOMPLETE` | Sign-in before submit |
| `ONBOARDING_TOKEN_INVALID` | Bad onboarding JWT |
| `ONBOARDING_ALREADY_COMPLETED` | Onboarding token after submit |
| `INVALID_DISTRICT` | Unknown district at register/location |
| `TIN_REQUIRED` | Submit without TIN |
| `DOCUMENT_TYPE_NOT_ALLOWED_FOR_ORG` | Wrong doc for org type |
| `PRIMARY_LOCATION_SETUP_REQUIRED` | Job/payment before map pin |
| `REJECTION_REASON_REQUIRED` | Admin reject without reason |

## Auth cleanup

**Removed** deprecated OTP aliases (`POST /auth/otp/request`, `POST /auth/otp/verify`) — now return **410 Gone**; use `/auth/sign-in/otp/*`.

**Added** password reset: `POST /auth/password/reset/request`, `POST /auth/password/reset/confirm` (OTP to registered phone; supports login by phone or email).

## Sign-in (existing users)

**Breaking:** `POST /auth/sign-in/password` body field `phone` renamed to **`login`** (phone E.164 or email). Error message: `Invalid login or password`.

| Method | Path |
|--------|------|
| POST | `/auth/sign-in/otp/request` |
| POST | `/auth/sign-in/otp/verify` |
| POST | `/auth/sign-in/password` — body `{ "login", "password" }` |
| POST | `/auth/refresh` |
| POST | `/auth/logout` |
| POST | `/auth/context` |

## Admin guardian onboarding

API unchanged. Documentation: [admin-onboarding.md](admin-onboarding.md) (request bodies, post-create state, ops screen map in [client-integration.md](client-integration.md)).

## Jobs — live tracking (added)

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/guardians/me/jobs` | `jobs:read` | Paginated guardian job history (all job statuses); full detail per item (`location`, `organization`, guardian `assignments[]` + `incidents`, `statusHistory`) |
| GET | `/jobs/:jobId/tracking` | `jobs:read` | Guardian position + site destination + `distanceMeters` / `etaMinutes` while assignment is `ACCEPTED`, `EN_ROUTE`, or `ON_SITE` |

- Job-scoped only (clients do not get global `GET /guardians/:id/location`).
- Guardian must send `POST /guardians/me/heartbeat` with lat/lng for fresh `location.source: "presence"`.
- ETA is straight-line (haversine), not turn-by-turn routing.

Docs: [jobs.md](jobs.md), [mobile-job-dispatch-and-tracking.md](mobile-job-dispatch-and-tracking.md), [job-dispatch-frontend.md](job-dispatch-frontend.md) §4.3.1.

## Early release workflow (added)

| Method | Path | Permission |
|--------|------|------------|
| POST | `/assignments/:id/early-release` | `assignments:early_release` |
| POST | `/assignments/:id/early-release/approve` | `assignments:early_release_approve` |
| POST | `/assignments/:id/early-release/reject` | `assignments:early_release_reject` |

New assignment status: `EARLY_RELEASE_REQUESTED`. Docs: [early-release.md](early-release.md). Migration: `20260603140000_early_release_workflow`. Re-run `npm run db:seed` for permissions.

## Admin billing policies (added)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/admin/billing-policies` | `admin:billing:read` |
| POST | `/admin/billing-policies` | `admin:billing:write` |
| PATCH | `/admin/billing-policies/:id` | `admin:billing:write` |

Docs: [admin-billing-policies.md](admin-billing-policies.md). Re-run `npm run db:seed:v1` after deploy for new permissions.

## Invoice dispute lifecycle (added)

| Change | Detail |
|--------|--------|
| Invoice statuses | `PENDING_CONFIRMATION`, `DISPUTED` |
| Client view | `GET /invoices/:id` moves `DRAFT` → `PENDING_CONFIRMATION` |
| Dispute | `POST /invoices/:id/dispute` (`billing:dispute`) |
| Admin resolve | `POST /admin/invoices/:id/resolve-dispute` (`admin:invoices:resolve_dispute`) — `CLEAR` or `VOID` |
| Void | `POST /invoices/:id/void` requires `voidReason`; optional `replacementInvoiceId` |
| Guards | Issue and payment blocked while `DISPUTED` |
| Email | `billing.invoiceDisputed`, `billing.invoiceDisputeResolved` |

Docs: [invoice-disputes.md](invoice-disputes.md). Re-run `npm run db:seed` after deploy.

## Billing ops observability (added)

| Change | Detail |
|--------|--------|
| Scheduled scan | Early completion (>30m before `scheduledEnd`) and late arrival (>15m after `scheduledStart`) → audit `billing.ops_alert` |
| Reconciliation | `GET /admin/billing/reconciliation?from&to` with org/guardian filters |
| Env | `BILLING_OPS_EARLY_COMPLETION_MINUTES`, `BILLING_OPS_LATE_ARRIVAL_MINUTES`, `BILLING_OPS_SCAN_LOOKBACK_HOURS` |

Docs: [admin-billing-ops.md](admin-billing-ops.md).

## Client invoice transparency contract (breaking for invoice JSON)

| Change | Detail |
|--------|--------|
| Detail endpoints | `GET /jobs/:id/invoice` and `GET /invoices/:id` return `ClientInvoiceDetail` (not raw DB row) |
| Org list | `GET /organizations/:id/invoices` returns `ClientInvoiceSummary[]` |
| Shape | `scheduledWindow`, `actual`, `billing`, `amounts`, `lineItems`, optional `dispute` / `void` / `payments` |
| Swagger | `ClientInvoiceDetailDto` |

Docs: [invoice-detail.md](invoice-detail.md). Update client parsers — flat `subtotal` / `billableHours` top-level fields removed from detail response.

## Billing confirmation (breaking for clients polling job status)

| Change | Detail |
|--------|--------|
| New job status | `AWAITING_CONFIRMATION` after guardian `POST /assignments/:id/complete` |
| Invoice timing | DRAFT on guardian complete; **ISSUED** only after `POST /jobs/:id/complete` or auto-confirm (`BILLING_AUTO_CONFIRM_HOURS`, default 24) |
| Billable hours | Default policy `MINIMUM_GUARANTEED`: `max(minimumHours, min(scheduled, actual))` from assignment `arrivedAt` → `completedAt` |
| Invoice fields | `scheduledHours`, `actualHours`, `billableHours`, `billingBasis`, `lineItems` on `GET /jobs/:id/invoice` |
| Email | `billing.invoiceAwaitingConfirmation` on DRAFT; `billing.invoiceIssued` on issue |

## Route migrations (dispatch / assignments)

| Old | New |
|-----|-----|
| `POST /dispatching/offers/accept` | `POST /assignments/:id/accept` |
| `POST /dispatching/offers/reject` | `POST /assignments/:id/decline` |
| `POST /dispatching/jobs/:jobId/dispatch` | `POST /jobs/:jobId/dispatch` |
| `POST /dispatching/jobs/:jobId/complete` | `POST /jobs/:jobId/complete` |
| `POST /dispatching/guardians/:id/heartbeat` | `POST /guardians/me/heartbeat` |
| `GET /billing/invoices/:jobId` | `GET /jobs/:jobId/invoice` |
| `POST /payments/confirm` | `POST /payments/:id/confirm` |
| `POST /guardians/:id/shift/start` | `POST /guardians/me/shift/start` |
| `POST /guardians/:id/shift/end` | `POST /guardians/me/shift/end` |

## Auth payload

Access tokens carry `activeOrgId`, `organizationIds`, and `orgId` (alias). Use `POST /auth/context` after login when the user belongs to multiple organizations.

