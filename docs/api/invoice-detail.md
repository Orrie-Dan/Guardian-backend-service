# Client invoice detail contract

Invoice endpoints return a **structured transparency payload** so clients can show scheduled vs actual vs billable hours without parsing raw Prisma rows.

> Full billing rollout (deploy, phases 1–6, app checklist): [../billing-overhaul-implementation.md](../billing-overhaul-implementation.md)

## Endpoints

| Method | Path | Response |
|--------|------|----------|
| GET | `/jobs/:id/invoice` | `ClientInvoiceDetail` |
| GET | `/invoices/:id` | `ClientInvoiceDetail` |
| GET | `/organizations/:id/invoices` | `ClientInvoiceSummary[]` |

Swagger: `ClientInvoiceDetailDto` on `/docs`.

## Detail shape (`ClientInvoiceDetail`)

```json
{
  "id": "uuid",
  "organizationId": "uuid",
  "jobId": "uuid",
  "job": {
    "referenceNumber": "JOB-2026-00042",
    "status": "AWAITING_CONFIRMATION"
  },
  "status": "PENDING_CONFIRMATION",
  "currency": "RWF",
  "scheduledWindow": {
    "startAt": "2026-06-01T08:00:00.000Z",
    "endAt": "2026-06-01T16:00:00.000Z",
    "hours": "8"
  },
  "actual": {
    "arrivedAt": "2026-06-01T08:05:00.000Z",
    "completedAt": "2026-06-01T11:00:00.000Z",
    "hours": "2.9167"
  },
  "billing": {
    "basis": "MINIMUM_GUARANTEED",
    "policyModel": "MINIMUM_GUARANTEED",
    "billableHours": "3"
  },
  "amounts": {
    "subtotal": "15000",
    "tax": "2700",
    "total": "17700"
  },
  "lineItems": [
    { "code": "scheduled_window", "label": "Scheduled window", "quantity": "8.00 hrs" },
    { "code": "actual_on_site", "label": "Actual on-site", "quantity": "2.92 hrs" },
    { "code": "billable_hours", "label": "Billable hours", "quantity": "3.00 hrs" }
  ],
  "payments": [],
  "issuedAt": null,
  "dueAt": null,
  "createdAt": "2026-06-01T11:05:00.000Z"
}
```

### Optional blocks

| Block | When |
|-------|------|
| `dispute` | `disputeReason` set (includes `resolvedAt` / `resolutionNote` after admin resolve) |
| `void` | `voidReason` set |
| `payments` | One or more payment rows exist |

## Summary shape (`ClientInvoiceSummary`)

Org invoice list uses a lighter row: `id`, `jobId`, `jobReference`, `status`, `currency`, `amounts`, `scheduledWindow`, `billing`, `createdAt`, `issuedAt`.

## UI guidance

1. **Confirmation screen** — show `scheduledWindow`, `actual`, `billing.billableHours`, and `lineItems` before `POST /jobs/:id/complete`.
2. **First open** — `GET /invoices/:id` moves `DRAFT` → `PENDING_CONFIRMATION` (see [invoice-disputes.md](invoice-disputes.md)).
3. **Amounts** — all money fields are **strings** (decimal serialization); display with `currency`.

## Related

- [jobs.md](jobs.md) — job status and complete flow
- [client-integration.md](client-integration.md) — client API table
- [email-notifications.md](email-notifications.md) — `billing.invoiceAwaitingConfirmation` mirrors key fields
