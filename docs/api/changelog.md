# API v1 — Changelog and breaking changes

All routes remain under `/api/v1`.

## Registration v2 (breaking)

**Removed** monolithic registration:

| Removed | Replacement |
|---------|-------------|
| `POST /auth/register` | `POST /auth/register/start` → `start/verify` → PATCH steps → `submit` |
| `POST /auth/register/verify-phone/request` | Phone OTP at start |
| `POST /auth/register/verify-phone/confirm` | `POST /auth/register/submit` |
| `POST /auth/register/otp/*` | Removed (were 410) |

**Added**

- `PATCH /auth/register/profile`, `business`, `payment`, `location`
- `GET /auth/register/status`
- `POST /auth/register/resume`
- `POST /organizations/:id/locations/primary/complete-site`

**Behavior**

- Onboarding JWT: `purpose: onboarding`, 7-day TTL.
- Registration location: no user lat/lon; district centroid server-side.
- `canBookJobs`: org `VERIFIED` **and** primary location `USER_PINNED`.
- Admin org reject requires `reason` in body.

See [onboarding.md](onboarding.md).

## Auth error codes (additions)

| Code | When |
|------|------|
| `ONBOARDING_INCOMPLETE` | Sign-in before submit |
| `ONBOARDING_TOKEN_INVALID` | Bad onboarding JWT |
| `ONBOARDING_ALREADY_COMPLETED` | Onboarding token after submit |
| `INVALID_DISTRICT` | Unknown district at register/location |
| `TIN_REQUIRED` | Submit without TIN |
| `DOCUMENT_TYPE_NOT_ALLOWED_FOR_ORG` | Wrong doc for org type |
| `PRIMARY_LOCATION_SETUP_REQUIRED` | Job/payment before map pin |
| `REJECTION_REASON_REQUIRED` | Admin reject without reason |

## Sign-in (existing users)

**Breaking:** `POST /auth/sign-in/password` body field `phone` renamed to **`login`** (phone E.164 or email). Error message: `Invalid login or password`.

| Method | Path |
|--------|------|
| POST | `/auth/sign-in/otp/request` |
| POST | `/auth/sign-in/otp/verify` |
| POST | `/auth/sign-in/password` — body `{ "login", "password" }` |
| POST | `/auth/refresh` |
| POST | `/auth/logout` |
| POST | `/auth/context` |

## Admin guardian onboarding

API unchanged. Documentation: [admin-onboarding.md](admin-onboarding.md) (request bodies, post-create state, ops screen map in [client-integration.md](client-integration.md)).

## Route migrations (dispatch / assignments)

| Old | New |
|-----|-----|
| `POST /dispatching/offers/accept` | `POST /assignments/:id/accept` |
| `POST /dispatching/offers/reject` | `POST /assignments/:id/decline` |
| `POST /dispatching/jobs/:jobId/dispatch` | `POST /jobs/:jobId/dispatch` |
| `POST /dispatching/jobs/:jobId/complete` | `POST /jobs/:jobId/complete` |
| `POST /dispatching/guardians/:id/heartbeat` | `POST /guardians/me/heartbeat` |
| `GET /billing/invoices/:jobId` | `GET /jobs/:jobId/invoice` |
| `POST /payments/confirm` | `POST /payments/:id/confirm` |
| `POST /guardians/:id/shift/start` | `POST /guardians/me/shift/start` |
| `POST /guardians/:id/shift/end` | `POST /guardians/me/shift/end` |

## Auth payload

Access tokens carry `activeOrgId`, `organizationIds`, and `orgId` (alias). Use `POST /auth/context` after login when the user belongs to multiple organizations.

