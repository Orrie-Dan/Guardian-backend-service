# API reference

All HTTP routes are prefixed with **`/api/v1`** (see `API_PREFIX` in `.env`).

## Swagger (source of truth for schemas)

Interactive OpenAPI documentation:

```
http://localhost:3000/docs
```

Use Swagger for request bodies, response shapes, and enums. Markdown docs here describe **flows, auth requirements, and policies** — not every field.

## Billing overhaul (phases 1–6)

**Implementation guide (deploy + app integration):** [../billing-overhaul-implementation.md](../billing-overhaul-implementation.md)

## Domain guides

| Doc | Contents |
|-----|----------|
| [jobs.md](jobs.md) | **Jobs API:** routes, statuses, dispatch summary, `GET …/tracking` contract |
| [client-integration.md](client-integration.md) | **Frontend/mobile:** which API for which screen, tokens, upload pattern |
| [mobile-job-dispatch-and-tracking.md](mobile-job-dispatch-and-tracking.md) | **Mobile (iOS/Android):** dispatch, accept, live map/ETA — single handoff doc |
| [job-dispatch-frontend.md](job-dispatch-frontend.md) | **Frontend/mobile:** job create → dispatch → accept (client + guardian polling) |
| [guardians.md](guardians.md) | **Guardian app:** duty status map (offline / available / busy), shift & heartbeat |
| [onboarding.md](onboarding.md) | Client registration v2, complete site, error codes |
| [admin-onboarding.md](admin-onboarding.md) | **Admin:** guardian create, vetting, verify, activate |
| [admin-pricing.md](admin-pricing.md) | **Admin:** pricing rule setup, precedence, examples |
| [admin-billing-policies.md](admin-billing-policies.md) | **Admin:** billing policy CRUD (billable hours models) |
| [invoice-disputes.md](invoice-disputes.md) | Invoice dispute, void, and admin resolution |
| [invoice-detail.md](invoice-detail.md) | Client invoice detail/summary JSON contract |
| [admin-billing-ops.md](admin-billing-ops.md) | Billing anomaly scan and reconciliation report |
| [auth.md](auth.md) | Sign-in, tokens |
| [email-notifications.md](email-notifications.md) | Transactional email matrix and delivery semantics |
| [admin.md](admin.md) | Admin route index, org/guardian/cert verification |
| [changelog.md](changelog.md) | v1 breaking changes, route migrations, deprecations |

## Endpoint map (by controller)

| Prefix | Module | Auth |
|--------|--------|------|
| `/auth` | Registration, sign-in, refresh | Mostly `@Public()`; see auth.md |
| `/users` | Profile | Bearer JWT |
| `/organizations` | Orgs, members, locations | Bearer JWT |
| `/jobs` | Jobs, dispatch, complete, invoice, **live tracking** (`GET …/tracking`) | Bearer JWT + permissions |
| `/assignments` | Accept/decline offers | Bearer JWT, `GUARDIAN` |
| `/guardians` | Shift, heartbeat, me — see [guardians.md](guardians.md) | Bearer JWT, `GUARDIAN` |
| `/admin` | Ops admin | Bearer JWT, `SUPER_ADMIN` or `OPS_ADMIN` |
| `/payments` | Payments | Bearer JWT |
| `/invoices` | Billing invoices | Bearer JWT |
| `/documents` | Post-login document upload | Bearer JWT |
| `/notifications` | Notifications | Bearer JWT |
| `/regions` | Region reference | Bearer JWT |
| `/webhooks` | External callbacks | Per integration |

## User journeys

Step-by-step narratives: [../user-journeys.md](../user-journeys.md).
