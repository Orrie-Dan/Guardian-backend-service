# Admin pay policies API

Base path: `/api/v1/admin`

How ops defines **how guardians are paid** (actual time vs minimum guaranteed). Policies are snapshotted onto each assignment at **offer accept**.

**Auth:** Bearer JWT with `SUPER_ADMIN` or `OPS_ADMIN`, plus `admin:billing:read` / `admin:billing:write`.

Route index: [admin.md](admin.md). Client billing policies: [admin-billing-policies.md](admin-billing-policies.md).

---

## Endpoints

| Method | Path | Permission |
|--------|------|------------|
| GET | `/admin/pay-policies` | `admin:billing:read` |
| POST | `/admin/pay-policies` | `admin:billing:write` |
| PATCH | `/admin/pay-policies/:id` | `admin:billing:write` |

---

## How matching works

When a guardian **accepts** an offer, the backend resolves the policy valid for the job `scheduledStart`:

1. `validFrom <= scheduledStart` and `validUntil` null or `>= scheduledStart`
2. Policies sorted by `priority DESC`
3. First match where optional filters align: `jobType`, `employmentType`

Resolved fields are stored on the assignment (`payPolicyModel`, `payMinimumHours`, `hourlyPayRateAtCommit`, etc.) and used at earnings accrual — policy changes do not affect past assignments.

---

## Pay models

| Model | Payable hours |
|-------|----------------|
| `ACTUAL_TIME` | `min(scheduled, actual on-site)` |
| `MINIMUM_GUARANTEED` | `max(minimumHours, min(scheduled, actual))` |

`actual` = assignment `arrivedAt` → `completedAt`.

When `applyOnEarlyRelease` is `false` and early release is approved, minimum is waived (pays actual time only).

---

## Platform default (seeded)

```json
{
  "priority": 1,
  "model": "MINIMUM_GUARANTEED",
  "minimumHours": 1,
  "applyOnEarlyRelease": true
}
```

Legacy assignments without a snapshot use `GUARDIAN_PAY_MINIMUM_HOURS` env fallback (default `1`) at accrual.

---

## Related

| Doc | Use for |
|-----|---------|
| [guardians.md](guardians.md) | Earnings lifecycle and ledger fields |
| [admin-billing-ops.md](admin-billing-ops.md) | Reconciliation includes `payableHours` |
