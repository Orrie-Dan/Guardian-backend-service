# Documentation

Index for G2 Sentry Guardian. Start at the [project README](../README.md) for quick start and seed credentials.

## Onboarding

| Document | Description |
|----------|-------------|
| [getting-started.md](getting-started.md) | Prerequisites, `.env`, database, npm scripts, dev OTP |
| [user-journeys.md](user-journeys.md) | Client register, admin verify, guardian onboard, jobs |

## Billing (production overhaul)

| Document | Description |
|----------|-------------|
| [**billing-overhaul-implementation.md**](billing-overhaul-implementation.md) | **Start here:** phases 1–6 summary, deploy checklist, app integration |
| [api/invoice-detail.md](api/invoice-detail.md) | Client invoice JSON contract |
| [api/invoice-disputes.md](api/invoice-disputes.md) | Dispute and void lifecycle |
| [api/early-release.md](api/early-release.md) | Early release workflow |
| [api/replacement.md](api/replacement.md) | Replacement handoff workflow |
| [api/admin-billing-policies.md](api/admin-billing-policies.md) | Admin billing policy CRUD |
| [api/admin-billing-ops.md](api/admin-billing-ops.md) | Anomaly scan and reconciliation |

## System

| Document | Description |
|----------|-------------|
| [architecture.md](architecture.md) | Modules, Prisma schemas, auth tokens, request pipeline |
| [operations.md](operations.md) | Deploy checklist, secrets, troubleshooting |
| [migration-prod.md](migration-prod.md) | Future production migration plan |

## API

| Document | Description |
|----------|-------------|
| [api/README.md](api/README.md) | API overview; use Swagger for schemas |
| [api/jobs.md](api/jobs.md) | Jobs module: endpoints, statuses, live tracking |
| [api/mobile-job-dispatch-and-tracking.md](api/mobile-job-dispatch-and-tracking.md) | **Mobile:** dispatch, accept, live map/ETA (handoff doc) |
| [api/job-dispatch-frontend.md](api/job-dispatch-frontend.md) | Job booking, dispatch, polling, tracking API details |
| [api/client-integration.md](api/client-integration.md) | **Apps:** screen → endpoint map (client, guardian, admin) |
| [api/guardians.md](api/guardians.md) | Guardian duty status: offline / available / busy |
| [api/onboarding.md](api/onboarding.md) | Client registration v2, complete site |
| [api/admin-onboarding.md](api/admin-onboarding.md) | Guardian create/activate (admin) |
| [api/auth.md](api/auth.md) | Sign-in, tokens, error codes |
| [api/admin.md](api/admin.md) | Admin route index, verification |
| [api/changelog.md](api/changelog.md) | v1 breaking changes and route migrations |

**Live API docs:** `http://localhost:3000/docs` (when the server is running).

## Documentation conventions

- **Swagger** — request/response shapes and enums
- **Markdown** — flows, policies, and operational guidance
- **Code** — source of truth for behavior ([`src/`](../src/), [`prisma/schema.prisma`](../prisma/schema.prisma))
