# Production migration (future)

The v1.0 schema was applied via `prisma migrate reset` on disposable dev data.

For production cutover:

1. Backfill `customer.organizations` from legacy `clients` (1:1 user mapping).
2. Map `jobs.client_id` → `organization_id` + default `location_id`.
3. Dual-write window: write both old and new tables until mobile apps ship v2 API.
4. Enable RLS only after all API nodes set `app.current_org` / `app.role` per request.
5. Run `prisma/migrations/partitioning.sql` during a maintenance window.
