# G2 Sentry Guardian

Security guardian platform API for Rwanda — businesses (clients) book vetted guardians for jobs; operations admins onboard guardians and verify organizations.

## Tech stack

- **API:** NestJS 10, TypeScript
- **Database:** PostgreSQL (multi-schema via Prisma 6)
- **Cache / queues:** Redis, BullMQ
- **Auth:** JWT access + refresh tokens, phone OTP (dev mode returns `devCode`)

## Quick start

```bash
npm install
cp .env.example .env   # edit DATABASE_URL and secrets
npx prisma migrate deploy
npm run db:seed:v1
npm run start:dev
```

| Resource | URL |
|----------|-----|
| API base | `http://localhost:3000/api/v1` |
| Swagger UI | `http://localhost:3000/docs` |

## Seed users (development)

After `npm run db:seed:v1` ([`prisma/seed.ts`](prisma/seed.ts)):

| Role | Phone | Password |
|------|-------|----------|
| Client owner | `+250788000001` | `TestPass123!` |
| Guardian (active, verified) | `+250788000002` | `TestPass123!` |

The seeded organization **Kigali Heights Security Ltd** is already `VERIFIED` — the client owner can book jobs immediately.

Admin routes (`/admin/*`) require `SUPER_ADMIN` or `OPS_ADMIN`. Those roles are seeded in the database but no admin user is created by default; assign an admin role to a user manually or extend the seed.

## Documentation

| Doc | Audience |
|-----|----------|
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/billing-overhaul-implementation.md](docs/billing-overhaul-implementation.md) | **Billing phases 1–6:** deploy, flows, app integration |
| [docs/getting-started.md](docs/getting-started.md) | Local setup, env vars, commands |
| [docs/user-journeys.md](docs/user-journeys.md) | Client, guardian, admin, and job flows |
| [docs/architecture.md](docs/architecture.md) | Modules, schemas, auth, request pipeline |
| [docs/operations.md](docs/operations.md) | Deploy, secrets, production migration |
| [docs/api/README.md](docs/api/README.md) | API overview (schemas live in Swagger) |
| [docs/api/jobs.md](docs/api/jobs.md) | Jobs API reference (incl. `GET /jobs/:id/tracking`) |
| [docs/api/mobile-job-dispatch-and-tracking.md](docs/api/mobile-job-dispatch-and-tracking.md) | Mobile: dispatch, accept, live map/ETA |
| [docs/api/job-dispatch-frontend.md](docs/api/job-dispatch-frontend.md) | Job dispatch & tracking integration |
| [docs/api/client-integration.md](docs/api/client-integration.md) | Client/mobile: screen → endpoint map |
| [docs/api/onboarding.md](docs/api/onboarding.md) | Client registration v2, complete site |
| [docs/api/admin-onboarding.md](docs/api/admin-onboarding.md) | Admin guardian create, vetting, activate |
| [docs/api/auth.md](docs/api/auth.md) | Sign-in, tokens, session |
| [docs/api/admin.md](docs/api/admin.md) | Admin route index and verification |
| [docs/api/changelog.md](docs/api/changelog.md) | v1 route migrations and deprecations |

## Common commands

```bash
npm run dev          # watch mode
npm run build        # compile
npm test             # unit tests
npx prisma studio    # browse database
```

See [docs/getting-started.md](docs/getting-started.md) for full details.
