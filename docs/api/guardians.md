# Guardian duty & availability

How product labels (**offline**, **available**, **busy**) map to API routes, database fields, and dispatch rules.

**Schemas:** Swagger at `{API_URL}/docs` (`ShiftStatus`, `GuardianShiftState`).  
**Guardian app screen map:** [client-integration.md](client-integration.md#profile--duty).  
**Onboarding & eligibility:** [admin-onboarding.md](admin-onboarding.md#dispatch-and-shift-eligibility).

---

## Product ↔ API ↔ database

| Product / UI label | Guardian action | API | `shift_status` | `available_for_jobs` |
|--------------------|-----------------|-----|----------------|----------------------|
| **Offline** (off duty) | Go offline | `POST /guardians/me/shift/end` | `OFF_DUTY` | `false` |
| **Available** (on duty, taking jobs) | Go on duty | `POST /guardians/me/shift/start` | `AVAILABLE` | `true` |
| **Busy** (on an assignment) | *(none — server sets)* | — | `BUSY` | `false` |

After a job completes or an offer expires, the server returns the guardian to **available** (`AVAILABLE` + `available_for_jobs: true`) when they were already on duty.

**Read current state:** `GET /guardians/me` → `shiftState` (`shiftStatus`, `availableForJobs`, `shiftStartedAt`, `shiftEndsAt`).

There is **no** single `PATCH /guardians/me/status` endpoint; use `shift/start` and `shift/end` as above.

### Initial and admin-forced states

| Situation | `shift_status` | `available_for_jobs` |
|-----------|----------------|----------------------|
| New guardian (`POST /admin/guardians`) | `OFF_DUTY` | `false` |
| Admin suspend (`POST /admin/guardians/:id/suspend`) | `OFF_DUTY` | `false` |
| Admin activate (profile only; guardian must start shift) | `OFF_DUTY` until `shift/start` | `false` |

---

## `ShiftStatus` enum (database)

| Value | Meaning | Set by |
|-------|---------|--------|
| `OFF_DUTY` | Offline — not in the dispatch pool | Guardian (`shift/end`), admin suspend, initial create |
| `AVAILABLE` | On duty and eligible for new offers | Guardian (`shift/start`), server after job/offer cleanup |
| `BUSY` | On duty but on an active offer/job | Server (dispatch, assignments) |
| `PAUSED` | Reserved in schema; **not used** by the API today | — |
| `SUSPENDED` | Account-level suspension context | Admin flows |

Do not send `BUSY` from the client; it is derived from assignment state.

---

## Connectivity vs duty (heartbeat)

| Concept | Mechanism | Affects dispatch? |
|---------|-----------|-------------------|
| **Duty / availability** | `guardian_shift_state` row | Yes — dispatch queries `shift_status = AVAILABLE` and `available_for_jobs = true` |
| **Reachable / location** | `POST /guardians/me/heartbeat` → Redis presence (~90s TTL) | Used for location history and connectivity checks; **does not** change `shift_status` |

A guardian can be **on duty** (`AVAILABLE`) but temporarily **unreachable** if heartbeats stop; that does not automatically call `shift/end`.

---

## Dispatch eligibility

A guardian is included in dispatch only when **all** of the following hold:

| Rule | Check |
|------|--------|
| Account active | `guardians.status = ACTIVE` |
| Identity verified | `guardians.verification_status = VERIFIED` |
| **Available (on duty)** | `shift_status = AVAILABLE` **and** `available_for_jobs = true` |
| District | Job district in `district_base` or `coverage_districts` |
| Certification | ≥1 cert `VERIFIED` and not past `expiry_date` |

`POST /guardians/me/shift/start` runs the same profile/cert checks before setting **available**.

---

## Recommended guardian app flow

```mermaid
stateDiagram-v2
  [*] --> Offline: default / shift/end
  Offline --> Available: POST shift/start
  Available --> Busy: accept offer / dispatch
  Busy --> Available: complete job / offer expires
  Available --> Offline: POST shift/end
```

1. After sign-in, show state from `GET /guardians/me` (`shiftState`).
2. **Go on duty** → `POST /guardians/me/shift/start` (handle eligibility errors).
3. While **available**, poll `GET /assignments/me` for offers.
4. During an active assignment, send `POST /guardians/me/heartbeat` on an interval (location).
5. **Go offline** → `POST /guardians/me/shift/end` (avoid if an active assignment is in progress — enforce in UI; server behavior may vary).

---

## Permissions

| Permission | Routes |
|------------|--------|
| `guardians:shift` | `POST /guardians/me/shift/start`, `POST /guardians/me/shift/end` |
| `guardians:heartbeat` | `POST /guardians/me/heartbeat` |
| `guardians:read_self` | `GET /guardians/me` |

---

## Related docs

| Doc | Contents |
|-----|----------|
| [client-integration.md](client-integration.md) | Guardian app screen → endpoint table |
| [admin-onboarding.md](admin-onboarding.md) | Create, verify, activate, suspend |
| [user-journeys.md](../user-journeys.md) | End-to-end guardian and job flows |
| [changelog.md](changelog.md) | Legacy route names (`/guardians/:id/shift/*` → `/guardians/me/shift/*`) |
