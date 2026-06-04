# Operations

Deployment and environment guidance for G2 Sentry Guardian.

## Pre-deploy checklist

1. **Build** — `npm ci && npm run build`
2. **Migrations** — `npx prisma migrate deploy` (never `migrate reset` in production)
3. **Generate client** — `npx prisma generate` (usually part of CI build)
4. **Seed permissions** — `npm run db:seed` after billing/dispute/early-release releases
5. **Secrets** — set production values for `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`; do not commit `.env`
6. **Redis** — `REDIS_ENABLED=true` and reachable `REDIS_URL` for OTP and refresh revocation
7. **Billing env** — `BILLING_AUTO_CONFIRM_HOURS`, `BILLING_OPS_*` — see [billing-overhaul-implementation.md](billing-overhaul-implementation.md)
8. **Documents** — `DOCUMENT_MAX_BYTES` (optional); verification files stored in PostgreSQL — plan DB backup size accordingly
9. **Node** — runtime Node 20+

## Environment variables

Copy from [`.env.example`](../.env.example). Production must override all `change-me` placeholders.

| Variable | Production notes |
|----------|------------------|
| `NODE_ENV` | `production` — disables OTP `devCode` in API responses |
| `DATABASE_URL` | Managed PostgreSQL; least-privilege DB user |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Long random strings; rotate with a planned logout window |
| `REDIS_URL` | Highly available Redis instance |
| `DOCUMENT_MAX_BYTES` | Cap per-file upload size (default 10485760) |
| `PINDO_ENABLED` | `true` in production |
| `PINDO_API_TOKEN` | Bearer token from Pindo dashboard |
| `PINDO_SENDER` | Registered sender name (e.g. your brand) |
| `BILLING_AUTO_CONFIRM_HOURS` | Client invoice auto-issue delay (default 24) |
| `BILLING_OPS_EARLY_COMPLETION_MINUTES` | Ops alert: early completion threshold (default 30) |
| `BILLING_OPS_LATE_ARRIVAL_MINUTES` | Ops alert: late arrival threshold (default 15) |
| `BILLING_OPS_SCAN_LOOKBACK_HOURS` | Ops scan lookback window (default 24) |

## Running in production

```bash
npm run build
npm run start:prod
```

Process manager (PM2, systemd, Kubernetes) should restart on failure and run health checks against the HTTP port (`PORT`, default 3000).

## Observability

| Tool | Use |
|------|-----|
| Swagger `/docs` | Smoke-test endpoints after deploy (protect or disable in production if needed) |
| `npx prisma studio` | Debug data locally only — not for production ops |
| Application logs | Nest default logging; audit table for security-sensitive actions |

### Analytics materialization runbook

- Background analytics refresh runs in-process and recomputes recent windows into `analytics.job_facts_daily` and `analytics.guardian_performance_daily`.
- Refresh interval is controlled by `ANALYTICS_REFRESH_INTERVAL_MS` (default `300000` = 5 minutes).
- Manual recompute endpoint: `POST /api/v1/admin/analytics/backfill` with:
  - required: `from`, `to` (UTC ISO timestamps)
  - optional: `district`, `organizationId`, `guardianId`
- Use manual backfill after imports, incident recovery, or KPI formula changes.
- Verify health by checking:
  - `/api/v1/admin/analytics/jobs` returns recent rows
  - `/api/v1/admin/analytics/guardians` returns recent rows
  - `/api/v1/admin/analytics/dashboard` shows non-stale KPI window and rates

## Database operations

- **Apply migrations:** `npx prisma migrate deploy`
- **Do not** run `prisma migrate reset` against production data
- **Future cutover:** see [migration-prod.md](migration-prod.md) for legacy client backfill, dual-write, RLS, and partitioning notes

## Security

- Keep `.env` out of version control
- Use HTTPS termination at the load balancer or reverse proxy
- Rate limits apply on auth routes (`@Throttle` on auth controller)
- Review admin routes — only `SUPER_ADMIN` and `OPS_ADMIN` roles

## Troubleshooting production issues

| Symptom | Check |
|---------|--------|
| 401 on all routes | JWT secret mismatch between instances; clock skew |
| OTP never arrives | `PINDO_ENABLED=true`, valid `PINDO_API_TOKEN` and `PINDO_SENDER`; check app logs for Pindo errors. Dev uses `devCode` when `NODE_ENV` is not `production`. |
| `ORG_PENDING_VERIFICATION` | Expected until admin verifies org — not a bug |
| Prisma errors after deploy | Migration not applied; run `migrate deploy` |
| Upload failures | File over `DOCUMENT_MAX_BYTES`; disallowed MIME type; multipart field names (`file`, `documentType` on registration) |
| Analytics endpoints empty | Confirm materializer interval is running, then run `POST /admin/analytics/backfill` for the target window |

## Related

- [getting-started.md](getting-started.md) — local setup
- [architecture.md](architecture.md) — system components
- [migration-prod.md](migration-prod.md) — production schema cutover plan
