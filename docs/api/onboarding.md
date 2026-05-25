# Client onboarding API (v2)

Base path: `/api/v1/auth/register`

Phone-first, resumable registration. Use Swagger (`/docs`) for request/response schemas.

## Flow overview

| Step | Method | Path | Auth |
|------|--------|------|------|
| 1a | POST | `/auth/register/start` | Public — request OTP |
| 1b | POST | `/auth/register/start/verify` | Public — verify OTP, get `onboardingToken` (7 days) |
| 2 | PATCH | `/auth/register/profile` | Bearer `onboardingToken` |
| 3 | PATCH | `/auth/register/business` | Bearer `onboardingToken` — creates organization |
| 4 | POST | `/auth/register/documents/presign` | Bearer `onboardingToken` |
| 4 | POST | `/auth/register/documents/:id/confirm` | Bearer `onboardingToken` |
| 5 | PATCH | `/auth/register/payment` | Bearer `onboardingToken` |
| 6 | PATCH | `/auth/register/location` | Bearer `onboardingToken` — address only (no lat/lon) |
| — | GET | `/auth/register/status` | Bearer `onboardingToken` |
| 7 | POST | `/auth/register/submit` | Bearer `onboardingToken` — returns full JWT |
| — | POST | `/auth/register/resume` | Public — resume incomplete registration |

After **submit**: sign in with password; org remains `PENDING` until admin verifies.

After **admin VERIFIED**: complete site on map (see below) before booking jobs.

## Document rules by `orgType`

| `orgType` | At least one document |
|-----------|------------------------|
| `INDIVIDUAL` | `NATIONAL_ID` or `TIN_CERTIFICATE` |
| All other types | `TIN_CERTIFICATE` or `BUSINESS_REGISTRATION` |

`OTHER` may be uploaded as supplementary evidence but does not satisfy the requirement alone (except for individuals, where only the types above count).

## Location at registration

`PATCH /auth/register/location` accepts `name`, `district`, `address`, and optional `sector`/`cell`/`village`.

- District must match `GET /regions/districts`.
- Server stores approximate coordinates (district centroid); `coordinatePrecision` is `DISTRICT_APPROX`.

## Submit requirements

- Profile: `fullName`, `email`, password
- Business: `legalName`, `orgType`, **`tinNumber`**
- Payment: mobile money provider + phone
- Location: primary site address
- ≥1 acceptable verification document
- Phone verified (step 1)

## Complete your site (after admin approval)

| Method | Path | Auth |
|--------|------|------|
| POST | `/organizations/:id/locations/primary/complete-site` | Bearer JWT + `organizations:manage_locations` |

Body: **`latitude`**, **`longitude`** (map pin); optional `name`, `address`.

Sets primary location to `USER_PINNED`. Required before `POST /jobs` (`canBookJobs: true`).

## `GET /users/me` flags (per organization)

| Field | Meaning |
|-------|---------|
| `canBookJobs` | `VERIFIED` and primary location `USER_PINNED` |
| `needsSiteSetup` | `VERIFIED` but site not pinned yet |
| `primaryLocationId` | Primary location UUID |
| `rejectionReason` | Set when admin rejects org |

## Error codes

| Code | When |
|------|------|
| `PHONE_ALREADY_REGISTERED` | Phone belongs to completed account |
| `ONBOARDING_TOKEN_INVALID` | Missing/expired onboarding JWT |
| `ONBOARDING_ALREADY_COMPLETED` | Submit already done |
| `ONBOARDING_INCOMPLETE` | Sign-in before submit |
| `ONBOARDING_ORG_REQUIRED` | Step needs organization (complete business first) |
| `INVALID_DISTRICT` | Unknown district name |
| `TIN_REQUIRED` | Submit without TIN |
| `DOCUMENTS_REQUIRED` | Submit without acceptable docs |
| `DOCUMENT_TYPE_NOT_ALLOWED_FOR_ORG` | Wrong doc type for org type |
| `INCOMPLETE_ONBOARDING` | Missing profile/business/location step |
| `ORG_PENDING_VERIFICATION` | Job/payment while org not admin-verified |
| `PRIMARY_LOCATION_SETUP_REQUIRED` | Job/payment while site not map-pinned |
| `REJECTION_REASON_REQUIRED` | Admin reject without reason |

## Resume

`POST /auth/register/resume` with `{ phone }` sends OTP, or `{ phone, password }` returns a new `onboardingToken` when password is already set.
