# Operations

Deployment and environment guidance for G2 Sentry Guardian.

## Pre-deploy checklist

1. **Build** — `npm ci && npm run build`
2. **Migrations** — `npx prisma migrate deploy` (never `migrate reset` in production)
3. **Generate client** — `npx prisma generate` (usually part of CI build)
4. **Secrets** — set production values for `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`; do not commit `.env`
5. **Redis** — `REDIS_ENABLED=true` and reachable `REDIS_URL` for OTP and refresh revocation
6. **S3** — `S3_BUCKET` and `S3_REGION` for document uploads
7. **Node** — runtime Node 20+

## Environment variables

Copy from [`.env.example`](../.env.example). Production must override all `change-me` placeholders.

| Variable | Production notes |
|----------|------------------|
| `NODE_ENV` | `production` — disables OTP `devCode` in API responses |
| `DATABASE_URL` | Managed PostgreSQL; least-privilege DB user |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Long random strings; rotate with a planned logout window |
| `REDIS_URL` | Highly available Redis instance |
| `S3_*` | Real bucket with IAM restricted to presigned upload |

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
| OTP never arrives | SMS provider integration (dev uses `devCode` only when not production) |
| `ORG_PENDING_VERIFICATION` | Expected until admin verifies org — not a bug |
| Prisma errors after deploy | Migration not applied; run `migrate deploy` |
| Upload failures | S3 credentials, bucket policy, CORS on presigned PUT |

## Related

- [getting-started.md](getting-started.md) — local setup
- [architecture.md](architecture.md) — system components
- [migration-prod.md](migration-prod.md) — production schema cutover plan
