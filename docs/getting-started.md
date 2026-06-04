# Getting started

Guide for running the G2 Sentry Guardian API locally.

## Prerequisites

| Requirement | Version / notes |
|-------------|-----------------|
| Node.js | 20+ ([`package.json`](../package.json) `engines`) |
| PostgreSQL | Running instance; connection string in `DATABASE_URL` |
| Redis | Optional — set `REDIS_ENABLED=false` in `.env` for in-memory fallbacks |

## Environment setup

1. Copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. Edit [`.env`](../.env) (never commit real secrets).

### Variable groups

| Group | Variables | Purpose |
|-------|-----------|---------|
| App | `NODE_ENV`, `PORT`, `API_PREFIX` | Server mode, port (default `3000`), route prefix (`/api/v1`) |
| Database | `DATABASE_URL`, `DB_*` | Prisma connection; `DATABASE_URL` is authoritative |
| Redis | `REDIS_ENABLED`, `REDIS_URL` | Session/cache; disable locally if Redis is unavailable |
| JWT | `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN` | Access and refresh tokens — use strong random secrets in production |
| OTP | `OTP_MAX_ATTEMPTS` | Brute-force limit for OTP verification |
| SMS (Pindo) | `PINDO_ENABLED`, `PINDO_API_TOKEN`, `PINDO_SENDER` | Send OTP via [Pindo](https://pindo.io); required in production |
| Dispatch | `DISPATCH_OFFER_TTL_MS` | How long guardian job offers remain valid (ms) |
| Dispatch | `DISPATCH_WINDOW_MS` | Max time to search for a guardian before job `FAILED` (default 600000 ms) |
| Billing | `BILLING_AUTO_CONFIRM_HOURS` | Hours before DRAFT invoice auto-issues if client does not confirm (default 24) |
| Billing ops | `BILLING_OPS_EARLY_COMPLETION_MINUTES`, `BILLING_OPS_LATE_ARRIVAL_MINUTES`, `BILLING_OPS_SCAN_LOOKBACK_HOURS` | Anomaly scan thresholds — see [billing-overhaul-implementation.md](billing-overhaul-implementation.md) |
| Documents | `DOCUMENT_MAX_BYTES` | Max upload size in bytes (default 10 MB); files stored in PostgreSQL |

## Database

```bash
# Apply migrations (safe for existing DBs)
npx prisma migrate deploy

# Regenerate client after schema changes
npx prisma generate

# Load development seed data (includes billing/dispute permissions)
npm run db:seed:v1
# alias: npm run db:seed
```

After pulling billing changes, ensure all three migrations under `prisma/migrations/20260603*` are applied. See [billing-overhaul-implementation.md](billing-overhaul-implementation.md).

For a **fresh disposable database** during development:

```bash
npx prisma migrate reset   # drops data, reapplies migrations, runs seed
```

Browse data: `npx prisma studio`.

## Run the API

```bash
npm install
npm run start:dev    # alias: npm run dev
```

- REST API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`

## npm scripts

| Script | Command | Description |
|--------|---------|-------------|
| Dev server | `npm run start:dev` | Nest watch mode |
| Build | `npm run build` | Compile to `dist/` |
| Production | `npm run start:prod` | Run compiled app |
| Tests | `npm test` | Jest unit tests |
| Prisma migrate (dev) | `npm run prisma:migrate` | Create/apply dev migrations |
| Seed | `npm run db:seed:v1` | Run [`prisma/seed.ts`](../prisma/seed.ts) |
| Prisma Studio | `npm run prisma:studio` | DB GUI |

## Testing authentication (development)

When `NODE_ENV` is not `production`, OTP endpoints include a **`devCode`** in the JSON response (see [`src/auth/otp.service.ts`](../src/auth/otp.service.ts)). Use it instead of SMS during local testing.

To test real SMS locally, set `PINDO_ENABLED=true`, `PINDO_API_TOKEN`, and `PINDO_SENDER` (approved sender ID from your Pindo account). OTP is sent with `POST https://api.pindo.io/v1/sms/` as documented by Pindo.

### New client registration (v2)

Phone-first flow — see [api/onboarding.md](api/onboarding.md):

1. `POST /api/v1/auth/register/start` with `{ "phone": "+250788999999" }`
2. `POST /api/v1/auth/register/start/verify` with phone + `devCode`
3. `PATCH` profile, business, documents, payment, location (no lat/lon — district + address only)
4. `POST /api/v1/auth/register/submit` → access token
5. After admin verifies the org: `POST /api/v1/organizations/:id/locations/primary/complete-site` with map coordinates before booking jobs

**Mobile / job flows:** [api/mobile-job-dispatch-and-tracking.md](api/mobile-job-dispatch-and-tracking.md) (dispatch, accept, `GET /jobs/:id/tracking`).

### Seeded client owner (skip registration)

```http
POST /api/v1/auth/sign-in/password
Content-Type: application/json

{
  "login": "+250788000001",
  "password": "TestPass123!"
}
```

Use the returned `accessToken` as `Authorization: Bearer <token>` on protected routes.

## Seed data summary

| Entity | Details |
|--------|---------|
| Client user | `+250788000001`, password `TestPass123!`, onboarding complete |
| Organization | Kigali Heights Security Ltd — `VERIFIED`, MoMo MTN |
| Locations | Primary site `USER_PINNED` (can book jobs); second site in Gasabo |
| Guardian user | `+250788000002`, `ACTIVE` + `VERIFIED`, certification seeded |

## Troubleshooting

### `EPERM` on `prisma generate` (Windows)

Another process is locking `node_modules/.prisma/client/query_engine-windows.dll.node`. Stop the Nest dev server (and any IDE Prisma processes), then run `npx prisma generate` again.

### Migration vs reset

- **`migrate deploy`** — apply pending migrations without dropping data (use for shared/staging DBs).
- **`migrate reset`** — wipe and reseed (local only).

### Build errors after pulling

```bash
npm install
npx prisma generate
npm run build
```

### Redis connection errors

Set `REDIS_ENABLED=false` in `.env` if you are not running Redis locally.

## Next steps

- **Client / mobile integration:** [api/client-integration.md](api/client-integration.md)
- **Jobs & live tracking:** [api/jobs.md](api/jobs.md), [api/mobile-job-dispatch-and-tracking.md](api/mobile-job-dispatch-and-tracking.md)
- Product flows: [user-journeys.md](user-journeys.md)
- System design: [architecture.md](architecture.md)
- API policies and routes: [api/README.md](api/README.md)
