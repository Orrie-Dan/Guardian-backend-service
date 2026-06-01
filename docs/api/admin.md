# Admin API

Base path: `/api/v1/admin`

Requires Bearer JWT with role **`SUPER_ADMIN`** or **`OPS_ADMIN`**.

Swagger: `/docs` → tag **admin**

## User deletion (admin)

Safe removal of test or mistaken accounts. Requires permission `admin:users:delete` (`SUPER_ADMIN` / `OPS_ADMIN` after seed).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/users/:id/delete-preview` | Dry-run: blockers, roles, guardian link |
| DELETE | `/admin/users/:id?mode=soft` | **Default:** soft-delete — `status=DELETED`, anonymize email/phone, revoke tokens |
| DELETE | `/admin/users/:id?mode=hard` | Permanently remove user (+ guardian rows). Dev only unless `ALLOW_HARD_USER_DELETE=true` |
| POST | `/admin/users/bulk-delete` | Body: `{ "emails": ["a@b.com"], "mode": "soft" }` — per-email result |

**Blockers (examples):** last `SUPER_ADMIN`, active jobs created by user, active guardian assignments, hard-delete while jobs/incidents still reference the user.

Re-run `npm run db:seed:v1` (or permission seed) after deploy so `admin:users:delete` exists for ops roles.

## Operations map (live guardians + client sites)

Poll **`GET /admin/map/guardians`** every 10–15s for moving markers; load **`GET /admin/map/sites`** once or rarely for organization site pins (not live user GPS).

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/admin/map/guardians` | `admin:guardians:read` | All guardians with merged presence / last history |
| GET | `/admin/map/sites` | `organizations:read` | All client organization locations |

**Guardian query filters:** `status`, `verificationStatus`, `connectedOnly`, `onDutyOnly`, `withLocationOnly` (booleans as `true`/`false`).

**Site query filters:** `coordinatePrecision` (`USER_PINNED` \| `DISTRICT_APPROX`), `locationStatus` (default `ACTIVE`), `organizationStatus`, `verificationStatus`, `primaryOnly`.

Both responses include `items` and `generatedAt` (ISO timestamp).

**Client apps** do not use the admin map for a single booked job. After a guardian accepts, clients poll **`GET /jobs/:jobId/tracking`** (`jobs:read`) for job-scoped guardian position and ETA. See [jobs.md](jobs.md) and [mobile-job-dispatch-and-tracking.md](mobile-job-dispatch-and-tracking.md).

---

## Guardian onboarding

**Full guide (request bodies, state after create, errors):** [admin-onboarding.md](admin-onboarding.md).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/guardians` | Create guardian profile (linked user) |
| GET | `/admin/guardians` | List guardians (filters in query DTO) |
| GET | `/admin/guardians/:id` | Guardian detail |
| PATCH | `/admin/guardians/:id` | Update profile |
| POST | `/admin/guardians/:id/vetting` | Upsert RNP vetting record |
| GET | `/admin/guardians/:id/certifications` | List certifications for a guardian |
| POST | `/admin/guardians/:id/certifications` | Add certification |
| GET | `/admin/certifications/:id` | Get one certification (with document metadata) |
| POST | `/admin/guardians/:id/activate` | Activate guardian (sends OTP) |
| POST | `/admin/guardians/:id/suspend` | Suspend guardian |

### Typical onboarding order

1. `POST /admin/guardians` — user + guardian + shift state (`INACTIVE` / `PENDING`) and temporary credentials dispatch (email first, SMS fallback)
2. `POST /admin/guardians/:id/vetting`
3. `POST /admin/guardians/:id/certifications`
4. `PATCH /admin/verification/certifications/:id` → `VERIFIED`
5. `PATCH /admin/verification/guardians/:id` → `VERIFIED`
6. `POST /admin/guardians/:id/activate` — requires step 5; sends OTP (`devCode` in dev)

Guardian then signs in via `/auth/sign-in/password` or OTP. If they used temporary credentials (`passwordSetAt = null`), sign-in returns `requiresPasswordSetup: true` and they must call `POST /auth/password/set` before normal password sessions. Afterward they can `POST /guardians/me/shift/start` when eligibility rules pass.

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
| GET | `/admin/verification/certifications` | Certification verification queue (`verificationStatus`, pagination; default `PENDING`) |
| PATCH | `/admin/verification/guardians/:id` | Set guardian `verificationStatus` |
| PATCH | `/admin/verification/certifications/:id` | Set certification `verificationStatus` |

## Dispatch eligibility (reference)

Duty status map (offline / available / busy): [guardians.md](guardians.md).

Guardians receive job offers only when:

- `status = ACTIVE`
- `verification_status = VERIFIED`
- **Available** on duty (`shift_status = AVAILABLE`, `available_for_jobs = true`)
- District matches `district_base` or `coverage_districts`
- At least one certification: `VERIFIED` and not past `expiry_date`

`POST /guardians/me/shift/start` enforces the same rules.

## Other admin capabilities

The admin controller also exposes pricing, audit, analytics, and billing helpers for operations.

Pricing setup guide: [admin-pricing.md](admin-pricing.md).

## Related

- [admin-onboarding.md](admin-onboarding.md) — guardian create/activate field reference
- [admin-pricing.md](admin-pricing.md) — pricing rule setup and precedence
- [user-journeys.md](../user-journeys.md) — guardian and org approval flows
- [auth.md](auth.md) — client registration (before admin org review)
