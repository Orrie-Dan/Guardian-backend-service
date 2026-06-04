# Invoice dispute lifecycle

B2B clients can dispute draft or issued invoices before payment. Ops resolves disputes via admin API.

## Invoice statuses

| Status | Meaning |
|--------|---------|
| `DRAFT` | Created on guardian complete; not yet viewed by client |
| `PENDING_CONFIRMATION` | Client opened `GET /invoices/:id` (or job invoice) — awaiting confirm or dispute |
| `ISSUED` | Client confirmed billing or auto-confirm; payable |
| `DISPUTED` | Client disputed; issue and payment blocked |
| `VOID` | Cancelled with required `voidReason` |
| `PAID` / `PARTIALLY_PAID` / `OVERDUE` | Standard payment lifecycle |

## Client flow

1. Guardian completes → invoice `DRAFT`, job `AWAITING_CONFIRMATION`.
2. Client views invoice → `DRAFT` → `PENDING_CONFIRMATION` (audit: `INVOICE_PENDING_CONFIRMATION`).
3. Client either:
   - `POST /jobs/:id/complete` — confirms job billing and issues invoice, or
   - `POST /invoices/:id/dispute` — `DISPUTED` with reason (permission: `billing:dispute`).
4. While `DISPUTED`, `POST /invoices/:id/issue` and `POST /payments` are rejected.

## Admin resolution

`POST /admin/invoices/:id/resolve-dispute` (permission: `admin:invoices:resolve_dispute`)

Body:

```json
{
  "action": "CLEAR",
  "note": "Hours verified with site log"
}
```

or void:

```json
{
  "action": "VOID",
  "voidReason": "Incorrect pricing rule applied",
  "replacementInvoiceId": "uuid-of-replacement",
  "note": "Reissued under corrected policy"
}
```

| Action | Effect |
|--------|--------|
| `CLEAR` | Restores `statusBeforeDispute` (`DRAFT`, `PENDING_CONFIRMATION`, or `ISSUED`) |
| `VOID` | Sets `VOID`, stores `voidReason`, optional `replacementInvoiceId` |

## Void (client or ops)

`POST /invoices/:id/void` requires body:

```json
{ "voidReason": "Duplicate invoice", "replacementInvoiceId": "optional-uuid" }
```

Cannot void `PAID` invoices.

## Emails

| Template | When |
|----------|------|
| `billing.invoiceDisputed` | Client disputes |
| `billing.invoiceDisputeResolved` | Admin clears dispute |
| `billing.invoiceVoided` | Void (includes reason) |

## Permissions (seed)

| Code | Roles |
|------|-------|
| `billing:dispute` | Client owner, ops admin |
| `admin:invoices:resolve_dispute` | Ops admin |

Run `npm run db:seed` after deploy to upsert permissions.

## Related

- [jobs.md](jobs.md) — `AWAITING_CONFIRMATION` and `POST /jobs/:id/complete`
- [client-integration.md](client-integration.md) — client API table
- [email-notifications.md](email-notifications.md) — billing templates
