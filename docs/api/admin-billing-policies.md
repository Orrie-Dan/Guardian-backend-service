# Admin billing policies API

Base path: `/api/v1/admin`

How ops admins define **how jobs are billed** (booked block vs actual time vs minimum guaranteed). Policies are snapshotted onto each job at create time.

**Auth:** Bearer JWT with role `SUPER_ADMIN` or `OPS_ADMIN`, plus billing policy permissions.

**Schemas:** Swagger at `/docs` → tag **admin**.

Route index: [admin.md](admin.md). Pricing rates (hourly/flat): [admin-pricing.md](admin-pricing.md).

---

## Endpoints

| Method | Path | Permission | Use |
|--------|------|------------|-----|
| GET | `/admin/billing-policies` | `admin:billing:read` | List policies in priority order |
| POST | `/admin/billing-policies` | `admin:billing:write` | Create a policy |
| PATCH | `/admin/billing-policies/:id` | `admin:billing:write` | Update a policy |

After deploy, run `npm run db:seed:v1` so `admin:billing:read` / `admin:billing:write` exist for ops roles.

---

## How matching works

When a job is created, the backend resolves the policy valid for `scheduledStart` (same pattern as pricing rules):

1. **Validity window**
   - `validFrom <= scheduledStart`
   - `validUntil` is null or `validUntil >= scheduledStart`
2. Policies sorted by `priority DESC`
3. First policy where filters match:
   - `organizationId` (if set on policy)
   - `jobType` (if set on policy)

The resolved `model` and `minimumHours` are stored on the job (`billingPolicyModel`, `billingMinimumHours`).

Invoice **amounts** still use [pricing rules](admin-pricing.md); billing policies control **billable hours**.

---

## Billing models

| Model | Billable hours |
|-------|----------------|
| `BOOKED_BLOCK` | Full scheduled window |
| `ACTUAL_TIME` | `min(scheduled, actual on-site)` |
| `MINIMUM_GUARANTEED` | `max(minimumHours, min(scheduled, actual))` |

`actual` = assignment `arrivedAt` → `completedAt`.

---

## POST body fields

| Field | Required | Notes |
|-------|----------|-------|
| `priority` | yes | Integer >= 0; higher wins first |
| `model` | yes | `BOOKED_BLOCK`, `ACTUAL_TIME`, `MINIMUM_GUARANTEED` |
| `minimumHours` | no | Default `2`; floor for `MINIMUM_GUARANTEED` |
| `organizationId` | no | UUID; scope to one client |
| `jobType` | no | e.g. `PATROL` |
| `prorationEnabled` | no | Default `true`; when early release approved, `BOOKED_BLOCK` bills actual time |
| `allowEarlyRelease` | no | Default `false`; must be true for guardian early-release requests |
| `earlyReleaseRequiresClientApproval` | no | Default `true`; if false, request is auto-approved |
| `autoApproveAfterMinutes` | no | Auto-approve pending requests after N minutes (e.g. 30) |
| `validFrom` | no | ISO date |
| `validUntil` | no | ISO date or omit |

---

## Example: platform default (already seeded)

```json
{
  "priority": 1,
  "model": "MINIMUM_GUARANTEED",
  "minimumHours": 2
}
```

## Example: enterprise booked-block override

```json
{
  "priority": 100,
  "organizationId": "00000000-0000-4000-8000-000000000001",
  "model": "BOOKED_BLOCK",
  "minimumHours": 0
}
```

## Example: update policy

`PATCH /admin/billing-policies/:id`

```json
{
  "priority": 120,
  "minimumHours": 3,
  "validUntil": "2026-12-31T23:59:59.000Z"
}
```

---

## Setup pattern (recommended)

1. Keep a **low-priority global fallback** (`MINIMUM_GUARANTEED`, no org/jobType).
2. Add **higher-priority overrides** per org or job type (e.g. `BOOKED_BLOCK` for a hotel chain).
3. Use `validFrom` / `validUntil` for contract changes.
4. Pair with [pricing rules](admin-pricing.md) — policy defines hours; pricing defines rates.

---

## Related

| Doc | Use for |
|-----|---------|
| [admin-pricing.md](admin-pricing.md) | Hourly/flat rates |
| [jobs.md](jobs.md) | `AWAITING_CONFIRMATION` and invoice confirmation |
| [changelog.md](changelog.md) | Billing confirmation breaking changes |
