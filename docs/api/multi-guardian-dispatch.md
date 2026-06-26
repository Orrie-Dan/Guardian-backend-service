# Multi-guardian dispatch — frontend integration

## Summary

`requestedGuardianCount` now drives **real dispatch staffing**, not only billing. A job remains in dispatch until `acceptedGuardianCount === requestedGuardianCount`.

## New job status

| Status | Meaning |
|--------|---------|
| `PARTIALLY_ASSIGNED` | At least one guardian accepted; dispatch continues for remaining slots |

Poll `GET /jobs/:id` until `status === 'ASSIGNED'` (fully staffed) or a terminal state (`FAILED`, `CANCELLED`).

`PARTIALLY_ASSIGNED` means guardians are on the job but more are still being recruited — treat like “still dispatching” for client wait UX.

## New / enriched response fields

### `GET /jobs/:id`

| Field | Type | Description |
|-------|------|-------------|
| `requestedGuardianCount` | number | Unchanged (billing + staffing target) |
| `staffing.requestedGuardianCount` | number | Same value, DB-derived bundle |
| `staffing.acceptedGuardianCount` | number | Staffed slots filled |
| `staffing.remainingGuardianSlots` | number | Slots still open |
| `staffing.pendingOfferCount` | number | In-flight offers |
| `staffing.isFullyStaffed` | boolean | `remainingGuardianSlots === 0` |
| `assignedGuardians` | array | Active staffed guardians with `assignmentId`, `guardianId`, `status`, `displayName`, `acceptedAt` |
| `assignmentProgress` | object | `{ filled, requested, remaining, isFullyStaffed }` |

Existing `assignments` array is unchanged (all assignment rows, all statuses).

### `GET /jobs/:id/tracking`

| Field | Change |
|-------|--------|
| `staffing` | **New** — same shape as above |
| `assignedGuardians` | **New** — per-guardian location, ETA, status |
| `assignment`, `guardian`, `location`, `distanceMeters`, `etaMinutes` | **Unchanged** — first trackable guardian (backwards compatible) |

## Client polling guidance

| Phase | Poll interval | Stop when |
|-------|---------------|-----------|
| Waiting for guardians | 3–5 s | `status === 'ASSIGNED'` **or** `staffing.isFullyStaffed` **or** terminal |
| Partial staffing | 3–5 s | `ASSIGNED` / `isFullyStaffed` |
| Tracking | 10–15 s | `IN_PROGRESS` / `COMPLETED` |

```typescript
const staffed =
  job.staffing?.isFullyStaffed ||
  job.status === 'ASSIGNED' ||
  job.status === 'IN_PROGRESS';

const stillDispatching =
  job.status === 'PENDING' ||
  job.status === 'DISPATCHING' ||
  job.status === 'PARTIALLY_ASSIGNED';
```

## UI states

1. **Dispatching** — `PENDING` / `DISPATCHING`, `acceptedGuardianCount === 0`
2. **Partially staffed** — `PARTIALLY_ASSIGNED` or `staffing.remainingGuardianSlots > 0` while some guardians accepted; show `assignmentProgress` (e.g. “2 of 3 officers assigned”)
3. **Fully assigned** — `ASSIGNED` and `isFullyStaffed`
4. **In progress** — at least one guardian `ON_SITE` (`IN_PROGRESS`)

## Dashboards / ops

- Map and admin job lists should surface `PARTIALLY_ASSIGNED` alongside `DISPATCHING`.
- Analytics: partial staffing counts as “in flight”, not completed.
- Replacement workflow (`SEEKING_REPLACEMENT`) is unchanged — still 1-for-1 substitute, separate from multi-guardian initial staffing.

## Breaking changes

None for single-guardian jobs (`requestedGuardianCount: 1` behaves as before).

Multi-guardian clients must stop assuming `ASSIGNED` after the first accept; use `staffing` or `assignmentProgress`.
