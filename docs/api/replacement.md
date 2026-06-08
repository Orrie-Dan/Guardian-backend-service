# Replacement handoff workflow

On-site guardians may request a **replacement officer** when they cannot continue coverage. Ops admin approves or denies. On approve, dispatch searches for a qualified substitute while the original officer **remains on site** (Option A). When the substitute marks on site, the system relieves the original officer and notifies the client.

**Related:** [jobs.md](jobs.md), [early-release.md](early-release.md), [guardians.md](guardians.md).

---

## Flow

```mermaid
stateDiagram-v2
  ON_SITE --> REPLACEMENT_REQUESTED: guardian_request
  REPLACEMENT_REQUESTED --> ON_SITE: admin_deny
  REPLACEMENT_REQUESTED --> ON_SITE: admin_approve
  note right of ON_SITE: job becomes SEEKING_REPLACEMENT
  SEEKING_REPLACEMENT --> IN_PROGRESS: sub_on_site_handoff
```

| Step | Actor | Endpoint |
|------|-------|----------|
| Request | Guardian (`ON_SITE` only) | `POST /assignments/:id/replacement-request` |
| List pending | Ops admin | `GET /admin/assignments/replacement-requests` |
| Approve | Ops admin | `POST /admin/assignments/:id/replacement/approve` |
| Deny | Ops admin | `POST /admin/assignments/:id/replacement/deny` |
| Accept / en-route / on-site | Substitute | Standard assignment endpoints |
| Complete job | Substitute (post-handoff) | `POST /assignments/:id/complete` |

Permissions: `assignments:replacement_request` (guardian); `admin:assignments:replacement` (ops).

---

## Request body

`POST /assignments/:id/replacement-request`

```json
{
  "reason": "Feeling unwell; unable to continue shift safely"
}
```

Deny body (optional note):

```json
{
  "note": "Try to hold coverage for 30 more minutes; backup en route"
}
```

---

## Handoff (Option A)

1. Original officer stays `ON_SITE` after admin approval until substitute arrives.
2. Substitute offer includes `replacesAssignmentId` linking to the departing assignment.
3. Substitute `POST .../on-site` triggers handoff:
   - Original assignment → `COMPLETED` (relieved at handoff time)
   - Substitute → `ON_SITE`
   - Job → `IN_PROGRESS`
4. Client owners receive email (`assignment.replacementCompleted`) and in-app notification **after handoff**, not when the request is filed.

---

## Job status

| Status | Meaning |
|--------|---------|
| `IN_PROGRESS` | Original on site |
| `SEEKING_REPLACEMENT` | Approved; dispatching substitute while original covers |
| `IN_PROGRESS` | Substitute on site after handoff |

---

## Billing

Draft invoices aggregate continuous coverage across relieved and final completed assignments:

- `arrivedAt` = earliest assignment `arrivedAt` on the job
- `completedAt` = final completing assignment `completedAt`
- Line item `replacement_handoff` when multiple completed assignments exist

---

## Notifications

| Event | Template | Recipients |
|-------|----------|------------|
| Request filed | `assignment.replacementRequested` | Ops admins |
| Handoff complete | `assignment.replacementCompleted` | Client owners |

Run `npm run db:seed` after deploy for new permissions.
