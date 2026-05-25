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
| Dispatch | `DISPATCH_OFFER_TTL_MS` | How long guardian job offers remain valid (ms) |
| Documents | `S3_BUCKET`, `S3_REGION` | Presigned upload targets for verification documents |

## Database

```bash
# Apply migrations (safe for existing DBs)
npx prisma migrate deploy

# Regenerate client after schema changes
npx prisma generate

# Load development seed data
npm run db:seed:v1
```

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

### New client registration (v2)

Phone-first flow — see [api/onboarding.md](api/onboarding.md):

1. `POST /api/v1/auth/register/start` with `{ "phone": "+250788999999" }`
2. `POST /api/v1/auth/register/start/verify` with phone + `devCode`
3. `PATCH` profile, business, documents, payment, location (no lat/lon — district + address only)
4. `POST /api/v1/auth/register/submit` → access token
5. After admin verifies the org: `POST /api/v1/organizations/:id/locations/primary/complete-site` with map coordinates before booking jobs

### Seeded client owner (skip registration)

```http
POST /api/v1/auth/sign-in/password
Content-Type: application/json

{
  "phone": "+250788000001",
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
- Product flows: [user-journeys.md](user-journeys.md)
- System design: [architecture.md](architecture.md)
- API policies and routes: [api/README.md](api/README.md)
