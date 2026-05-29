# Admin guardian onboarding API

Base path: `/api/v1/admin`

Ops-only flow to create and activate field guardians. **Guardians cannot self-register** (`POST /auth/register/*` is for clients only).

**Auth:** Bearer access JWT with role `SUPER_ADMIN` or `OPS_ADMIN`, plus the permissions listed per step (see [architecture.md](../architecture.md)).

**Schemas:** Swagger at `/docs` → tag **admin** (enums and response shapes). This document lists **request fields, initial state, and sequence**.

Narrative overview: [../user-journeys.md](../user-journeys.md) §3. Route index: [admin.md](admin.md).

---

## Flow overview

| Step | Method | Path | Permission |
|------|--------|------|------------|
| 1 | POST | `/admin/guardians` | `admin:guardians:write` |
| 2 | POST | `/admin/guardians/:id/vetting` | `admin:guardians:write` |
| 3 | POST | `/admin/guardians/:id/certifications` | `admin:guardians:write` |
| 4 | PATCH | `/admin/verification/certifications/:id` | `admin:verification:write` |
| 5 | PATCH | `/admin/verification/guardians/:id` | `admin:verification:write` |
| 6 | POST | `/admin/guardians/:id/activate` | `admin:guardians:activate` |
| — | POST | `/admin/guardians/:id/suspend` | `admin:guardians:suspend` |

Optional: `GET /admin/guardians`, `GET /admin/guardians/:id`, `PATCH /admin/guardians/:id`, `GET /admin/verification/guardians` for queues and edits.

After **activate**, the guardian signs in (`/auth/sign-in/password` or OTP), may set a password (`POST /auth/password/set`), then `POST /guardians/me/shift/start` when eligibility passes.

---

## State after create (step 1)

`POST /admin/guardians` runs one transaction and provisions:

| Entity | Initial state |
|--------|----------------|
| `identity.users` | `status: PENDING_VERIFICATION`, temporary password hash stored, `passwordSetAt: null` |
| `identity.user_roles` | `GUARDIAN` assigned by creating admin |
| `guardian.guardians` | `status: INACTIVE`, `verificationStatus: PENDING`, auto `guardianCode` (`G-00001`, …) |
| `guardian.guardian_shift_state` | `shiftStatus: OFF_DUTY`, `availableForJobs: false` |
| `guardian.guardian_vetting_records` | Created only if `rnpReferenceNumber` sent in create body |

Sensitive values are **never stored in plain text**: `nationalId` and optional `reserveForceNumber` are bcrypt-hashed server-side.

The guardian **cannot** go **available** (on duty) or receive dispatch offers until steps 4–6 complete and they sign in. See [guardians.md](guardians.md).

Credential dispatch at create time:

- If `email` is present, credentials are sent by email first.
- If email is missing or email delivery fails, SMS fallback is attempted to `phone`.
- Guardians should sign in and immediately call `POST /auth/password/set` to replace the temporary password.

---

## Step 1 — Create guardian

`POST /admin/guardians`

### Request body

| Field | Required | Notes |
|-------|----------|-------|
| `phone` | yes | E.164, e.g. `+250788123456` |
| `fullName` | yes | |
| `nationalId` | yes | Indangamuntu; stored hashed |
| `districtBase` | yes | Primary district for dispatch matching |
| `sectorBase` | no | |
| `coverageDistricts` | no | String array; defaults to `[districtBase]` if omitted |
| `dateOfBirth` | no | ISO date string |
| `gender` | no | `MALE`, `FEMALE`, `OTHER`, `PREFER_NOT_TO_SAY` |
| `email` | no | |
| `employmentType` | no | `FULL_TIME`, `PART_TIME`, `RESERVE` (default `PART_TIME` on record) |
| `yearsExperience` | no | Integer ≥ 0 |
| `specializations` | no | See enums below |
| `preferredShift` | no | `DAY`, `NIGHT`, `BOTH` |
| `reserveForceNumber` | no | Stored hashed |
| `rnpReferenceNumber` | no | If set, creates inline vetting record at create time |
| `vettingNotes` | no | Used with inline vetting |

**`specializations` values:** `PATROL`, `ESCORT`, `EVENT_SECURITY`, `DOOR_SUPERVISION`, `VIP_PROTECTION`, `EMERGENCY_RESPONSE`, `COMPOUND_SECURITY`, `STATIC_POST`.

### Example

```json
{
  "phone": "+250788123456",
  "fullName": "Jean Uwimana",
  "nationalId": "1199980088888888",
  "districtBase": "Gasabo",
  "sectorBase": "Remera",
  "coverageDistricts": ["Gasabo", "Kicukiro"],
  "employmentType": "FULL_TIME",
  "yearsExperience": 5,
  "specializations": ["PATROL", "EVENT_SECURITY"],
  "preferredShift": "BOTH",
  "rnpReferenceNumber": "RNP-2024-12345"
}
```

### Response

Returns the **guardian profile** (includes nested `user`, `shiftState`, optional `vettingRecord`) plus credential dispatch metadata (`credentialsDispatched`, `credentialsChannel`). Save `id` (guardian UUID) for later steps.

### Errors

| HTTP | When |
|------|------|
| 409 | Phone already registered |
| 403 | Missing `admin:guardians:write` |

---

## Step 2 — RNP vetting record

`POST /admin/guardians/:id/vetting` (upsert)

| Field | Required | Notes |
|-------|----------|-------|
| `vettedAt` | yes | ISO date-time |
| `rnpReferenceNumber` | no | |
| `clearanceDocumentId` | no | UUID from document upload flow |
| `reserveForceVerified` | no | Default `false` |
| `notes` | no | |

Skip if vetting was created inline at step 1 with `rnpReferenceNumber`.

---

## Step 3 — Add certification

`POST /admin/guardians/:id/certifications`

| Field | Required | Notes |
|-------|----------|-------|
| `certificationType` | yes | See below |
| `issuer` | yes | |
| `issueDate` | yes | ISO date |
| `expiryDate` | no | ISO date |
| `documentId` | no | Linked uploaded document |

**`certificationType` values:** `FIRST_AID`, `CROWD_CONTROL`, `FIREARM`, `RESERVE_FORCE`, `RNP_SECURITY_LICENSE`.

New certifications start with `verificationStatus: PENDING`.

Guardians **cannot** add their own certifications (`POST` on guardian routes returns forbidden).

---

## Step 4 — Verify certification

`PATCH /admin/verification/certifications/:certificationId`

```json
{ "status": "VERIFIED" }
```

Or reject:

```json
{ "status": "REJECTED", "reason": "Document illegible" }
```

At least one **verified, non-expired** certification is required before shift start and dispatch.

---

## Step 5 — Verify guardian identity

`PATCH /admin/verification/guardians/:guardianId`

```json
{ "status": "VERIFIED" }
```

Required before **activate** (step 6). Activation returns `409` if guardian is not `VERIFIED`.

Queue: `GET /admin/verification/guardians` (pending guardians).

---

## Step 6 — Activate

`POST /admin/guardians/:id/activate`

No body. Sets:

- `identity.users.status` → `ACTIVE`
- `guardian.guardians.status` → `ACTIVE`, `activatedAt` / `activatedBy`

Sends OTP to the guardian phone. In **non-production**, the JSON response may include `devCode` for local testing.

Guardian then:

1. `POST /auth/sign-in/otp/verify` or password sign-in (after `POST /auth/password/set` if needed)
2. `POST /guardians/me/shift/start` when profile eligibility passes

---

## Suspend

`POST /admin/guardians/:id/suspend`

Sets guardian `SUSPENDED`, forces shift `OFF_DUTY`, clears availability. Permission: `admin:guardians:suspend`.

---

## Dispatch and shift eligibility

Product ↔ API duty mapping (offline / available / busy): [guardians.md](guardians.md).

A guardian receives job offers and can start a shift only when:

| Rule | Field / check |
|------|----------------|
| Account active | `guardians.status = ACTIVE` |
| Identity verified | `guardians.verification_status = VERIFIED` |
| **Available** (on duty) | `shift_status = AVAILABLE` and `available_for_jobs = true` (after `POST /guardians/me/shift/start`) |
| District | Job district in `district_base` or `coverage_districts` |
| Certification | ≥1 cert `VERIFIED` and `expiry_date` not in the past |

Same rules enforced by `POST /guardians/me/shift/start` and dispatch.

---

## Error codes (guardian-facing, after activation)

| Code | When |
|------|------|
| `GUARDIAN_NOT_ACTIVATED` | Sign-in or API use before activate |
| `GUARDIAN_NOT_ACTIVE` | Shift start while not `ACTIVE` |
| `GUARDIAN_NOT_VERIFIED` | Shift start while identity not verified |
| `CERTIFICATION_REQUIRED` | Shift start without valid verified cert |

Admin create: `409` with message `Phone number already registered` (no `code` field on that conflict).

---

## Local testing

Default seed creates a **ready guardian** (`+250788000002`, `VERIFIED`, `ACTIVE`) — not the admin create flow.

To exercise admin create locally:

1. Sign in as a user with `OPS_ADMIN` or `SUPER_ADMIN` — `POST /auth/sign-in/password` with `"login": "<email>"` or phone (see [auth.md](auth.md)). Assign role in DB if needed; see [getting-started.md](../getting-started.md).
2. Run steps 1–6 against a new phone number.
3. Sign in as that guardian and call `POST /guardians/me/shift/start`.

---

## Related

| Doc | Use for |
|-----|---------|
| [admin.md](admin.md) | Admin route index (orgs, pricing, audit) |
| [client-integration.md](client-integration.md) | Ops portal screen → API map |
| [auth.md](auth.md) | Sign-in, tokens |
| [../user-journeys.md](../user-journeys.md) | Product sequence diagrams |
