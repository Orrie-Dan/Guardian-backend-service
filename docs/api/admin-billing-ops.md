# Admin billing ops

Operational visibility for billing anomalies and scheduled-vs-actual reconciliation.

## Scheduled anomaly scan

`BillingOpsAutomationService` runs every 60 seconds (skipped in `NODE_ENV=test`). It writes **deduplicated** audit entries (one per assignment) when:

| Alert | Condition | Audit action |
|-------|-----------|--------------|
| Early completion | `completedAt` more than `BILLING_OPS_EARLY_COMPLETION_MINUTES` (default **30**) before `scheduledEnd` | `BILLING_ALERT_EARLY_COMPLETION` |
| Late arrival | `arrivedAt` more than `BILLING_OPS_LATE_ARRIVAL_MINUTES` (default **15**) after `scheduledStart` | `BILLING_ALERT_LATE_ARRIVAL` |

Entity type: `billing.ops_alert`, entity id: assignment id. Filter in `GET /admin/audit-logs?entityType=billing.ops_alert`.

Lookback window: `BILLING_OPS_SCAN_LOOKBACK_HOURS` (default **24**).

## Reconciliation report

`GET /admin/billing/reconciliation` — permission `admin:billing:read`

Query:

| Param | Required | Description |
|-------|----------|-------------|
| `from` | yes | ISO UTC; filter by assignment `completedAt` (inclusive) |
| `to` | yes | ISO UTC; inclusive |
| `organizationId` | no | Org filter |
| `guardianId` | no | Guardian filter |

Response:

- `items[]` — per completed assignment: scheduled/actual/billable hours, payable hours, guardian pay estimate, invoice status/total, `earlyCompletion`, `lateArrival`, minute deltas
- `summary` — counts and hour totals (includes `totalPayableHours`)
- `meta.lowSampleSize` — `true` when fewer than 20 rows (avoid noisy comparisons)

### Example

```
GET /api/v1/admin/billing/reconciliation?from=2026-06-01T00:00:00.000Z&to=2026-06-30T23:59:59.999Z
```

## Environment

```env
BILLING_OPS_EARLY_COMPLETION_MINUTES=30
BILLING_OPS_LATE_ARRIVAL_MINUTES=15
BILLING_OPS_SCAN_LOOKBACK_HOURS=24
```

## Related

- [admin-billing-policies.md](admin-billing-policies.md)
- [invoice-disputes.md](invoice-disputes.md)
- [admin.md](admin.md) — audit log search
