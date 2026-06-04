# Admin pricing setup API

Base path: `/api/v1/admin`

How ops admins define and maintain billing price rules used when invoices are created from jobs.

**Auth:** Bearer JWT with role `SUPER_ADMIN` or `OPS_ADMIN`, plus pricing permissions.

**Schemas:** Swagger at `/docs` -> tag **admin** (source of truth for field types).

Route index: [admin.md](admin.md).

---

## Endpoints

| Method | Path | Permission | Use |
|--------|------|------------|-----|
| GET | `/admin/pricing-rules` | `admin:pricing:read` | List current rules in priority order |
| POST | `/admin/pricing-rules` | `admin:pricing:write` | Create a new pricing rule |
| PATCH | `/admin/pricing-rules/:id` | `admin:pricing:write` | Update an existing rule |

---

## How matching works

When creating an invoice, the backend loads rules valid for the job date and picks the first rule that matches:

1. **Validity window** must match the job start:
   - `validFrom <= scheduledStart`
   - `validUntil` is null or `validUntil >= scheduledStart`
2. Rules are sorted by `priority DESC`
3. First rule where all provided filters match:
   - `organizationId` (if set)
   - `district` (if set)
   - `jobType` (if set)

If no rule matches, invoice creation fails with `No pricing rule matched`.

---

## Setup pattern (recommended)

1. Create a **fallback global rule** (no org, no district, no jobType) with low priority.
2. Add **more specific overrides** with higher priority, for example:
   - org + district + jobType
   - org + jobType
   - district + jobType
3. Use `validFrom`/`validUntil` for promotions or future price changes.
4. Keep exactly one intended winner for any scenario to avoid confusion.

---

## POST body fields

| Field | Required | Notes |
|-------|----------|-------|
| `priority` | yes | Integer >= 0. Higher value wins first. |
| `pricingModel` | yes | `HOURLY`, `FLAT`, `TIERED` (current billing logic applies `HOURLY` or `FLAT`) |
| `organizationId` | no | UUID filter |
| `district` | no | District filter |
| `jobType` | no | Job type filter |
| `hourlyRate` | no | Required in practice for `HOURLY` |
| `flatFee` | no | Required in practice for `FLAT` |
| `validFrom` | no | ISO date/time (defaults from DB if omitted) |
| `validUntil` | no | ISO date/time or null |
| `currency` | no | 3-letter currency, defaults `RWF` |

> Note: if `pricingModel` is `HOURLY` but `hourlyRate` is missing (or `FLAT` without `flatFee`), invoice calculation fails with `Pricing rule has no applicable rate`.

---

## Example: create fallback rule

```json
{
  "priority": 1,
  "pricingModel": "HOURLY",
  "hourlyRate": 5000,
  "currency": "RWF"
}
```

## Example: create specific override

```json
{
  "priority": 100,
  "organizationId": "00000000-0000-4000-8000-000000000001",
  "district": "Gasabo",
  "jobType": "PATROL",
  "pricingModel": "HOURLY",
  "hourlyRate": 7500,
  "currency": "RWF"
}
```

## Example: update a rule

`PATCH /admin/pricing-rules/:id`

```json
{
  "priority": 120,
  "hourlyRate": 8000,
  "validUntil": "2026-12-31T23:59:59.000Z"
}
```

---

## Invoice calculation notes

**Billable hours** (from resolved billing policy on the job, default platform policy `MINIMUM_GUARANTEED`):

- `BOOKED_BLOCK`: `billableHours = scheduledHours`
- `ACTUAL_TIME`: `billableHours = min(scheduledHours, actualHours)`
- `MINIMUM_GUARANTEED`: `billableHours = max(minimumHours, min(scheduledHours, actualHours))`

`actualHours` = assignment `arrivedAt` → `completedAt`. Policy is snapshotted on job create (`billingPolicyModel`, `billingMinimumHours`).

**Rates** (pricing rules):

- `HOURLY`: `subtotal = hourlyRate * billableHours * requestedGuardianCount`
- `FLAT`: `subtotal = flatFee * requestedGuardianCount` (duration recorded on invoice for transparency)
- `taxAmount = subtotal * 0.18`
- `total = subtotal + taxAmount`

Currency comes from the matched rule.

---

## Common mistakes

| Mistake | Result | Fix |
|--------|--------|-----|
| No global fallback rule | Some jobs cannot be invoiced | Add low-priority default rule |
| Two overlapping rules with same intent | Surprising winner by priority | Increase clarity: one winner per scope |
| Missing rate for chosen model | `Pricing rule has no applicable rate` | Ensure `hourlyRate` or `flatFee` is present |
| Expired/invalid dates | Rule never matches | Check `validFrom`/`validUntil` against job start |

---

## Related

| Doc | Use for |
|-----|---------|
| [admin.md](admin.md) | Full admin route index |
| [admin-billing-policies.md](admin-billing-policies.md) | Billable-hours policy (separate from rates) |
| [client-integration.md](client-integration.md) | Ops portal route mapping |
| [../architecture.md](../architecture.md) | High-level module architecture |
