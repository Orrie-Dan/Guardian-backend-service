# Guardian Services API

Client apps should load the service catalog and booking policy from the API — never hardcode prices.

## List active services (client)

`GET /services` — requires `services:read`

```json
[
  {
    "id": "…",
    "code": "STANDARD_GUARDIAN",
    "name": "Standard Guardian",
    "description": "General-purpose on-site security and patrol coverage.",
    "hourlyRate": "5000.00",
    "currency": "RWF",
    "isActive": true,
    "requiresLicense": false
  }
]
```

Use `code` as `jobType` when creating a job (`POST /jobs`).

## Booking policy

`GET /services/booking-policy` — requires `services:read`

Returns minimum booking hours, surcharge ranges, and `minimumCharge` (lowest active service rate × minimum hours).

## Admin service catalog

| Method | Path | Permission |
|--------|------|------------|
| GET | `/admin/services` | `admin:services:read` |
| POST | `/admin/services` | `admin:services:write` |
| PATCH | `/admin/services/:id` | `admin:services:write` |
| DELETE | `/admin/services/:id` | `admin:services:write` |
| GET | `/admin/booking-settings` | `admin:services:read` |
| PATCH | `/admin/booking-settings` | `admin:services:write` |

Update `hourlyRate` on any service; clients see new prices on the next `GET /services` call.

## Service codes (`jobType`)

- `STANDARD_GUARDIAN`
- `CORPORATE_GUARDIAN`
- `EVENT_GUARDIAN`
- `CHILD_ESCORT_GUARDIAN`
- `MEDICAL_ESCORT_GUARDIAN`
- `EXECUTIVE_VIP_GUARDIAN`
- `ARMED_GUARDIAN` (`requiresLicense: true`)

## Invoice revenue split

Invoices include line items derived from the admin hourly rate:

- Guardian share (default 80%)
- Platform share (15%)
- Payment gateway (3%)
- Operational reserve (2%)

Percentages are configurable via `PATCH /admin/booking-settings`.

## Legacy pricing rules

Org/district overrides via `/admin/pricing-rules` still apply on top of the service catalog base rate when `hourlyRate` is set on the rule.
