# Jobs API

Base path: **`/api/v1/jobs`**

Bearer JWT required. Permission codes are enforced per route (see [permissions seed](../../prisma/seed/permissions.ts)).

**Swagger:** `/docs` → tag **jobs** (request/response schemas).

**Integration guides:**

| Audience | Document |
|----------|----------|
| Mobile (iOS/Android) | [mobile-job-dispatch-and-tracking.md](mobile-job-dispatch-and-tracking.md) |
| Web / client + guardian UX | [job-dispatch-frontend.md](job-dispatch-frontend.md) |
| Screen → endpoint map | [client-integration.md](client-integration.md) |
| Billing (confirm, invoice JSON) | [../billing-overhaul-implementation.md](../billing-overhaul-implementation.md) |
| Business flows | [../user-journeys.md](../user-journeys.md) §4 |

---

## Overview

Jobs represent a client’s booked security shift at an organization **location**. Assignment to a guardian is **asynchronous**:

1. Client creates a job (`POST /jobs`) → status `PENDING`, outbox enqueues dispatch.
2. Background dispatch offers **one guardian at a time** (90s TTL per offer).
3. Guardian accepts via **`POST /assignments/:id/accept`** (not under `/jobs`).
4. Client polls **`GET /jobs/:id`** then **`GET /jobs/:id/tracking`** for map/ETA.

Implementation: [`JobsService`](../../src/jobs/jobs.service.ts), [`DispatchingService`](../../src/dispatching/dispatching.service.ts), [`AssignmentsService`](../../src/assignments/assignments.service.ts).

---

## Job status (`job.jobs.status`)

| Status | Meaning |
|--------|---------|
| `PENDING` | Created; dispatch queued or retrying |
| `DISPATCHING` | Explicit dispatch requested (`POST /jobs/:id/dispatch`) |
| `ASSIGNED` | Guardian accepted an offer |
| `IN_PROGRESS` | Guardian on site (assignment `ON_SITE`) |
| `AWAITING_CONFIRMATION` | Guardian completed; DRAFT invoice created; client must confirm (or auto-confirm after `BILLING_AUTO_CONFIRM_HOURS`) |
| `COMPLETED` | Client confirmed billing (or auto-confirmed); invoice issued |
| `FAILED` | Dispatch failed — see `dispatchFailureReason` (`dispatch_timeout`, `dispatch_pool_exhausted`, etc.) |
| `CANCELLED` | Cancelled by client/admin |

---

## Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/jobs` | `jobs:create` | Create job; auto-dispatch by default |
| GET | `/jobs` | `jobs:read` | Paginated list (scoped by role/org) |
| GET | `/jobs/:id` | `jobs:read` | Detail: location, org, **assignments**, statusHistory |
| GET | `/jobs/:id/tracking` | `jobs:read` | **Live guardian position + ETA** (see below) |
| GET | `/jobs/:id/timeline` | `jobs:read` | Status history rows |
| GET | `/jobs/:id/invoice` | `jobs:read_invoice` | `ClientInvoiceDetail` — see [invoice-detail.md](invoice-detail.md) |
| GET | `/jobs/:id/incidents` | `jobs:read` | Field incidents |
| POST | `/jobs/:id/incidents` | `jobs:create_incident` | Report incident (guardian on assignment) |
| POST | `/jobs/:id/dispatch` | `jobs:dispatch` | Queue dispatch; `PENDING`/`DISPATCHING` → `DISPATCHING` |
| PATCH | `/jobs/:id/cancel` | `jobs:cancel` | Cancel; releases open offers |
| POST | `/jobs/:id/complete` | `jobs:complete` | Client confirms billing: `AWAITING_CONFIRMATION` → `COMPLETED`, issues DRAFT invoice + `billing.invoiceIssued` email (idempotent if already `COMPLETED`) |

### List query (`GET /jobs`)

| Query | Notes |
|-------|--------|
| `page`, `limit` | Pagination |
| `status` | Filter by job status |
| `organizationId` | Ops only |

**List does not include `assignments[]`.** Use detail for assignment state.

### Access control

[`ResourceOwnerPolicy.assertJobAccess`](../../src/common/policies/resource-owner.policy.ts):

- **Ops** — any job
- **Org member** — jobs for their organization
- **Guardian** — jobs where they have any assignment row

---

## Live tracking — `GET /jobs/:id/tracking`

Job-scoped read for **clients** (and assigned guardians / ops). Does **not** grant global `GET /guardians/:id/location` (ops-only `guardians:read`).

### When available

Active assignment required with status:

- `ACCEPTED`
- `EN_ROUTE`
- `ON_SITE`

Otherwise **400** — *"Live tracking is only available after a guardian accepts the job"*.

### Response shape

| Field | Description |
|-------|-------------|
| `jobId`, `jobStatus` | Job identifiers |
| `assignment` | `id`, `status`, `acceptedAt`, `arrivedAt` (ISO strings) |
| `guardian` | `id`, `displayName` (from user `fullName` or `phoneNumber`) |
| `location` | Guardian position — see below |
| `destination` | Job site (`locationId`, `name`, `address`, lat/lng strings) |
| `distanceMeters` | Haversine straight-line to site; `null` if coords missing |
| `etaMinutes` | Rough minutes from distance + speed; `null` if distance unknown |

**`location` object** (same as guardian location API):

| Field | Notes |
|-------|--------|
| `latitude`, `longitude` | Decimal strings |
| `speed` | m/s when present from heartbeat |
| `batteryLevel` | Optional |
| `recordedAt` | ISO timestamp |
| `source` | `presence` (Redis, ~90s TTL) \| `history` (last DB point) \| `null` |
| `connected` | Redis presence exists |
| `reachable` | Presence `available` flag |

### ETA behavior

Computed in [`geo.util.ts`](../../src/common/geo.util.ts):

- Straight-line distance (not road routing).
- Uses guardian `speed` (m/s) when ≥ 1 m/s; else assumes ~30 km/h.
- Minimum returned ETA: **1 minute**.

Clients may compute their own ETA with a maps SDK if needed.

### Fresh location dependency

Guardian must call **`POST /guardians/me/heartbeat`** with `latitude` and `longitude` during the job. Without heartbeats, `location.source` may be `history` with stale `recordedAt`.

### Constants (code)

| Constant | Value | File |
|----------|-------|------|
| Offer TTL | 90 s | `DISPATCH_OFFER_TTL_MS` → `OFFER_TTL_MS` |
| Dispatch search window | 10 min | `DISPATCH_WINDOW_MS` — job → `FAILED` (`dispatch_timeout`) when exceeded |
| Dispatch pool size | 50 | `DISPATCH_POOL_SIZE` — max guardians considered per pass |
| Max offers per job | 20 | `MAX_OFFERS_PER_JOB` — safety cap |
| Unreachable grace | 2 min | `DISPATCH_UNREACHABLE_GRACE_MS` |
| URGENT parallel offers | 3 | `URGENT_PARALLEL_OFFERS` |
| Presence TTL | 90 s | `src/redis/presence.service.ts` |

---

## Dispatch behavior (summary)

| Topic | Behavior |
|-------|----------|
| Offers at once | **One** guardian per job per round |
| Selection | District match, verified/active, on duty, valid cert, **reliability_score**, reachable via heartbeat |
| Decline / expiry | Guardian released; dispatch re-queued |
| No guardian found | Retries every ~2s; job may stay `PENDING` (attempts not incremented) |
| `requestedGuardianCount` | Billing multiplier only; dispatch still assigns **one** accept path |

Full detail: [job-dispatch-frontend.md](job-dispatch-frontend.md).

---

## Assignment endpoints (guardian)

Not under `/jobs` — controller prefix **`/assignments`**:

| Method | Path | Permission |
|--------|------|------------|
| GET | `/assignments/me` | `assignments:read` |
| POST | `/assignments/:id/accept` | `assignments:accept` |
| POST | `/assignments/:id/decline` | `assignments:decline` |
| POST | `/assignments/:id/en-route` | `assignments:en_route` |
| POST | `/assignments/:id/on-site` | `assignments:on_site` |
| POST | `/assignments/:id/replacement-request` | `assignments:replacement_request` | Guardian requests replacement (see [replacement.md](replacement.md)) |
| POST | `/assignments/:id/early-release` | `assignments:early_release` | Guardian requests early end (see [early-release.md](early-release.md)) |
| POST | `/assignments/:id/early-release/approve` | `assignments:early_release_approve` | Client approves early release |
| POST | `/assignments/:id/early-release/reject` | `assignments:early_release_reject` | Client rejects; assignment returns `ON_SITE` |
| POST | `/assignments/:id/complete` | `assignments:complete` | Completes from `ON_SITE` or approved `EARLY_RELEASE_REQUESTED`; job → `AWAITING_CONFIRMATION`; DRAFT invoice |

Accept sets job → `ASSIGNED` and cancels other open offers for that job.

---

## Ops map vs client tracking

| Use case | Endpoint | Audience |
|----------|----------|----------|
| All guardians on map | `GET /admin/map/guardians` | Ops admin |
| Client site pins | `GET /admin/map/sites` | Ops admin |
| Single job guardian + ETA | `GET /jobs/:id/tracking` | Client org members (`jobs:read`) |

See [admin.md](admin.md) for ops map filters.

---

## Related changelog

[changelog.md](changelog.md) — `GET /jobs/:jobId/tracking` and route migrations.
