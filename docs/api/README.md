# API reference

All HTTP routes are prefixed with **`/api/v1`** (see `API_PREFIX` in `.env`).

## Swagger (source of truth for schemas)

Interactive OpenAPI documentation:

```
http://localhost:3000/docs
```

Use Swagger for request bodies, response shapes, and enums. Markdown docs here describe **flows, auth requirements, and policies** — not every field.

## Domain guides

| Doc | Contents |
|-----|----------|
| [client-integration.md](client-integration.md) | **Frontend/mobile:** which API for which screen, tokens, upload pattern |
| [onboarding.md](onboarding.md) | Client registration v2, complete site, error codes |
| [auth.md](auth.md) | Sign-in, tokens |
| [admin.md](admin.md) | Guardian onboarding, org/guardian/cert verification |
| [changelog.md](changelog.md) | v1 breaking changes, route migrations, deprecations |

## Endpoint map (by controller)

| Prefix | Module | Auth |
|--------|--------|------|
| `/auth` | Registration, sign-in, refresh | Mostly `@Public()`; see auth.md |
| `/users` | Profile | Bearer JWT |
| `/organizations` | Orgs, members, locations | Bearer JWT |
| `/jobs` | Jobs, dispatch, complete, invoice | Bearer JWT + roles |
| `/assignments` | Accept/decline offers | Bearer JWT, `GUARDIAN` |
| `/guardians` | Shift, heartbeat, me | Bearer JWT, `GUARDIAN` |
| `/admin` | Ops admin | Bearer JWT, `SUPER_ADMIN` or `OPS_ADMIN` |
| `/payments` | Payments | Bearer JWT |
| `/invoices` | Billing invoices | Bearer JWT |
| `/documents` | Post-login document upload | Bearer JWT |
| `/notifications` | Notifications | Bearer JWT |
| `/regions` | Region reference | Bearer JWT |
| `/webhooks` | External callbacks | Per integration |

## User journeys

Step-by-step narratives: [../user-journeys.md](../user-journeys.md).
