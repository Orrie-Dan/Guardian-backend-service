# Multi-guardian dispatch — production readiness review

**Review date:** 2026-06-26  
**Verdict:** Production-ready for controlled rollout after fixes in this review, with documented residual risks below.

---

## Concurrency verification

### What was verified

| Mechanism | Location | Evidence |
|-----------|----------|----------|
| Job row lock (`SELECT … FOR UPDATE`) | `job-staffing.util.ts` → `lockJobForStaffingUpdate` | Raw SQL locks `job.jobs` before staffing checks |
| Assignment row lock | `assignment-accept.util.ts` → `lockAssignmentRow` | Raw SQL locks `job.job_assignments` at start of every accept |
| Slot cap before accept | `assignments.service.ts` `accept()` | After job lock: `countStaffedGuardians >= requestedGuardianCount` → `400` |
| Post-accept staffing | `job-staffing.service.ts` → `applyAcceptStaffingUpdate` | Re-counts staffed; cancels excess offers **inside the same transaction** when full |
| Conditional accept update | `assignment-accept.util.ts` → `transitionOfferedAssignment` | `updateMany` requires `status = OFFERED` (prevents accepting cancelled offers) |
| Version bump on cancel | `competing-offer-release.util.ts` | Cancelled offers increment `versionNumber` so stale accepts fail |

### Alternate code paths removed

- **`DispatchingService.acceptOffer` removed** — only `POST /assignments/:id/accept` (`AssignmentsService.accept`) can accept offers. No bypass.

### Integration tests (real PostgreSQL)

Run: `RUN_INTEGRATION_TESTS=1 npm run test:integration`

| Test | Proves |
|------|--------|
| 4 concurrent accepts, 2 slots | Exactly 2 `ACCEPTED`, staffed count = 2, job → `ASSIGNED`, 2 offers `CANCELLED` |
| 2 concurrent accepts, same offer | Exactly 1 success, 1 `ConflictException`/`BadRequestException`, `versionNumber = 2` |
| 1 slot, 3 offers | 1 `ACCEPTED`, 2 `CANCELLED`, 0 `OFFERED` remaining |

---

## Assignment safety

### Double-accept protection (layers)

1. **Assignment `FOR UPDATE`** — serializes concurrent accepts of the same row.
2. **Optimistic version** — `updateMany` on `{ id, versionNumber, status: OFFERED }`; second writer gets `count = 0` → `ConflictException`.
3. **Status guard** — cannot accept if not `OFFERED` (including after in-tx cancel of excess offers).
4. **Version bump on cancel** — excess-offer cancellation invalidates in-flight accept attempts that read stale version.

### Tests

- Unit: `assignment-accept.util.spec.ts`
- Integration: duplicate concurrent accept test (PostgreSQL)

---

## Cancellation timing

| Step | In transaction? |
|------|-----------------|
| Final guardian accept | Yes |
| `cancelExcessOffersInTransaction` (DB → `CANCELLED`) | Yes |
| Job → `ASSIGNED` | Yes |
| `releaseCompetingOffers` (queue expiry + shift AVAILABLE) | **No** — post-commit cleanup only |

**Why overstaffing cannot occur:** While the final accept holds the job row lock, excess offers are marked `CANCELLED` before commit. Any concurrent accept blocks on the job lock; when it proceeds, either slots are full (`400`) or the offer row is no longer `OFFERED` (`400`/`409`).

Post-transaction `releaseCompetingOffers` only affects Redis queue timers and shift availability — not staffing counts.

---

## Lifecycle verification

### Transitions

| Scenario | Job status after | Regression? |
|----------|------------------|-------------|
| Partial accept (N−1 of N) | `PARTIALLY_ASSIGNED` | No |
| Full staffing | `ASSIGNED` | No |
| First on-site | `IN_PROGRESS` (from `ASSIGNED` or `PARTIALLY_ASSIGNED`) | No |
| Guardian no-show while `IN_PROGRESS` | Stays `IN_PROGRESS`; refill via outbox | **No** `PARTIALLY_ASSIGNED` regression |
| Guardian no-show while `ASSIGNED` | `PARTIALLY_ASSIGNED` + refill | Intended |
| All guardians complete | `AWAITING_CONFIRMATION` only when zero active staffed | No |

### Replacement workflow

`SEEKING_REPLACEMENT` unchanged — 1-for-1 substitute via `replacesAssignmentId`; excluded from multi-guardian staffing counts.

### Tests

- `job-staffing.service.spec.ts` — IN_PROGRESS refill does not call `transitionToPartiallyAssigned`

---

## Financial verification

### Billing

- One **invoice per job**; `requestedGuardianCount` multiplies subtotal (`billing-calculation.service.ts`) — unchanged, correct for multi-guardian.

### Payroll / earnings

- `GuardianPayrollService.accrueForPaidInvoice` iterates **all** `COMPLETED` assignments on the job.
- `GuardianEarning.assignmentId` is **unique** — one earning per assignment; idempotent skip if exists.
- Test added: multi-guardian job creates 2 earnings for 2 guardians.

### Partial completion

- Draft invoice created only when job reaches `AWAITING_CONFIRMATION` (all active guardians completed).
- Individual guardian completion does not trigger billing until all finish.

---

## Frontend impact

See [multi-guardian-dispatch.md](./multi-guardian-dispatch.md).

**Critical client assumption change:** `ASSIGNED` no longer means “first guardian only” — it means **fully staffed**. Clients polling for a guardian must wait for `ASSIGNED` or `staffing.isFullyStaffed`, not first accept.

**Backward compatible fields:** `GET /jobs/:id/tracking` top-level `assignment` / `guardian` still returns the first trackable guardian.

---

## Database review

| Item | Status |
|------|--------|
| Multiple assignments per job | Supported (`JobAssignment[]`, unique on `jobId + guardianId + assignmentRound`) |
| `GuardianEarning.assignmentId` unique | Prevents duplicate pay per assignment |
| Index `job_assignments(job_id, status)` | Supports staffing counts |
| FK cascades | Job assignments cascade on job delete |
| `PARTIALLY_ASSIGNED` migration | `20260626120000_partially_assigned` |

**Recommended future index (Low):** partial index on `(job_id)` WHERE `status = 'OFFERED' AND replaces_assignment_id IS NULL` if dispatch volume grows.

---

## Performance review

| Area | Finding |
|------|---------|
| Job row lock | Serializes all accepts per job — correct, may add latency under burst accepts |
| Dispatch parallel offers | Capped at `min(URGENT_PARALLEL_OFFERS, remainingSlots − pendingOffers)` |
| Tracking API | N guardian location lookups (one per assigned guardian) — acceptable for N ≤ 10 |
| `getTracking` | Sequential `getCurrent` per guardian — optimize with batch if N grows large |

---

## Failure recovery

| Failure point | Behavior |
|---------------|----------|
| Accept tx rollback | Assignment stays `OFFERED`; job lock released; no partial staffing |
| Post-tx `releaseCompetingOffers` fails | DB already consistent; queue/shift may be stale until reconciliation |
| Notification failure | Outside accept transaction — accept still succeeds |
| Outbox enqueue after partial accept | Best-effort; dispatch may need manual re-trigger if outbox down |

---

## Remaining risks

| Severity | Risk | Mitigation |
|----------|------|------------|
| **Medium** | Under extreme concurrency, PostgreSQL may return serialization/deadlock errors before application `400` | Clients should retry accept on `409`/transient DB errors; integration test validates invariants regardless of error type |
| **Medium** | `releaseCompetingOffers` post-commit — guardian shift may briefly stay non-available if cleanup fails | Existing reconciliation + offer expiry handlers |
| **Low** | `findForGuardian` returns single `activeAssignment` | Multi-active-job guardians see one; document or extend API |
| **Low** | Mobile poll docs still reference `ASSIGNED` only | Update client apps per `multi-guardian-dispatch.md` |
| **Low** | Tracking sequential GPS fetches | Batch optimization when N > 5 |

**No Critical or unresolved High issues** after this review.

---

## Files changed in this review

| File | Change |
|------|--------|
| `assignment-accept.util.ts` | Assignment lock + conditional OFFERED→ACCEPTED |
| `competing-offer-release.util.ts` | Version bump on cancel |
| `assignments.service.ts` | Hardened accept flow |
| `dispatching.service.ts` | Removed duplicate `acceptOffer` |
| `job-staffing.service.ts` | `jobAlreadyLocked` option; no IN_PROGRESS regression |
| `test/integration/*` | PostgreSQL concurrency tests |
| `guardian-payroll.service.spec.ts` | Multi-guardian earnings test |
