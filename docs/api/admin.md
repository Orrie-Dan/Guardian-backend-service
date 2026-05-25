# Admin API

Base path: `/api/v1/admin`

Requires Bearer JWT with role **`SUPER_ADMIN`** or **`OPS_ADMIN`**.

Swagger: `/docs` → tag **admin**

## Guardian onboarding

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/guardians` | Create guardian profile (linked user) |
| GET | `/admin/guardians` | List guardians (filters in query DTO) |
| GET | `/admin/guardians/:id` | Guardian detail |
| PATCH | `/admin/guardians/:id` | Update profile |
| POST | `/admin/guardians/:id/vetting` | Upsert RNP vetting record |
| POST | `/admin/guardians/:id/certifications` | Add certification |
| POST | `/admin/guardians/:id/activate` | Activate guardian (sends OTP) |
| POST | `/admin/guardians/:id/suspend` | Suspend guardian |

### Typical onboarding order

1. `POST /admin/guardians`
2. `POST /admin/guardians/:id/vetting`
3. `POST /admin/guardians/:id/certifications`
4. `PATCH /admin/verification/certifications/:id` → `VERIFIED`
5. `PATCH /admin/verification/guardians/:id` → `VERIFIED`
6. `POST /admin/guardians/:id/activate`

Activation triggers OTP to the guardian phone. In development, the activate response may include `devCode` (see guardian service).

Guardian then signs in via `/auth/sign-in/password` or OTP and can `POST /guardians/me/shift/start` when eligibility rules pass.

## Organization verification

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/verification/organizations` | Pending orgs with verification docs, users, locations |
| PATCH | `/admin/verification/organizations/:id` | Set `verificationStatus` (e.g. `VERIFIED`, `REJECTED`) |

Use after a client completes registration (step 2). Approving the org enables `canBookJobs` and job/payment mutations.

## Guardian and certification verification

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/verification/guardians` | Pending guardians |
| PATCH | `/admin/verification/guardians/:id` | Set guardian `verificationStatus` |
| PATCH | `/admin/verification/certifications/:id` | Set certification `verificationStatus` |

## Dispatch eligibility (reference)

Guardians receive job offers only when:

- `status = ACTIVE`
- `verification_status = VERIFIED`
- On duty (`shift_status = AVAILABLE`)
- District matches `district_base` or `coverage_districts`
- At least one certification: `VERIFIED` and not past `expiry_date`

`POST /guardians/me/shift/start` enforces the same rules.

## Other admin capabilities

The admin controller also exposes pricing, audit, analytics, and billing helpers for operations — see Swagger for the full list under `/admin`.

## Related

- [user-journeys.md](../user-journeys.md) — guardian and org approval flows
- [auth.md](auth.md) — client registration (before admin org review)
