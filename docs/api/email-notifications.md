# Email notifications

Transactional emails are sent via SMTP when configured (`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, optional `SMTP_USER` / `SMTP_PASS`, `SMTP_SECURE`). Each message includes a branded **HTML** body (with a plain-text fallback for clients that do not render HTML).

**Delivery semantics:** best-effort for all events below — API operations succeed even if email delivery fails. Failures are logged server-side.

Guardian credential delivery (create guardian) uses a dedicated flow with **email first, SMS fallback** — see [admin-onboarding.md](admin-onboarding.md).

## Notification matrix

| Template key | Trigger | Recipients | Channel notes |
|--------------|---------|------------|---------------|
| `security.otpCode` | OTP flows (`OtpService`) | User email (if set) | Same code as SMS; sign-in, password reset, guardian activation, etc. |
| `security.passwordResetRequested` | *(reserved)* | — | Superseded by `security.otpCode` with `purpose=password_reset` |
| `security.passwordResetCompleted` | `POST /auth/password/reset/confirm` | User email | |
| `security.passwordSet` | `POST /auth/password/set` | User email | |
| `onboarding.applicationSubmitted` | `POST /auth/register/submit` | Submitting user email | In-app also sent |
| `verification.orgApproved` | `PATCH /admin/verification/organizations/:id` → `VERIFIED` | Org `CLIENT_OWNER` emails | In-app also sent |
| `verification.orgRejected` | `PATCH /admin/verification/organizations/:id` → `REJECTED` | Org `CLIENT_OWNER` emails | Includes rejection reason; in-app also sent |
| `guardian.activated` | `POST /admin/guardians/:id/activate` | Guardian user email | Account notice; OTP also via `security.otpCode`; in-app also sent |
| `guardian.suspended` | `POST /admin/guardians/:id/suspend` | Guardian user email | In-app also sent |
| *(credentials)* | `POST /admin/guardians` | Guardian email or SMS fallback | See credential delivery service |
| `job.created` | Job create | Org owners | In-app also sent |
| `job.cancelled` | Job cancel | Org owners | In-app also sent |
| `dispatch.offerReceived` | Guardian offered on dispatch | Guardian user email | In-app also sent; offer **expiry** is in-app only (no email) |
| `assignment.earlyReleaseRequested` | Guardian `POST /assignments/:id/early-release` (client approval required) | Org owners | Includes reason text; in-app also sent |
| `assignment.replacementRequested` | Guardian `POST /assignments/:id/replacement-request` | Ops admins (`OPS_ADMIN`, `SUPER_ADMIN`) | Includes reason text; in-app also sent |
| `assignment.replacementCompleted` | Substitute `POST /assignments/:id/on-site` (replacement handoff) | Org owners | Sent **after** handoff, not when request is filed; in-app also sent |
| `billing.invoiceAwaitingConfirmation` | Guardian `POST /assignments/:id/complete` (DRAFT invoice created) | Org owners | Includes billable hours and estimated total; in-app also sent |
| `billing.invoiceIssued` | `POST /jobs/:id/complete`, billing auto-confirm, or `POST /invoices/:id/issue` | Org owners | Idempotent if invoice already issued; in-app also sent |
| `billing.invoiceDisputed` | `POST /invoices/:id/dispute` | Org owners | Includes dispute reason; in-app also sent |
| `billing.invoiceDisputeResolved` | `POST /admin/invoices/:id/resolve-dispute` (`CLEAR`) | Org owners | In-app also sent |
| `billing.invoiceVoided` | `POST /invoices/:id/void` or resolve `VOID` | Org owners | Includes void reason; in-app also sent |
| `billing.paymentConfirmed` | Payment confirm | Org owners | In-app also sent |
| `guardian.payoutConfirmed` | `POST /admin/guardian-payouts/:id/confirm` | Guardian user email | In-app also sent |

## In-app notification matrix

In-app rows are stored in `system.notifications` and returned by `GET /notifications`. Recipients match email rules: org events go to **`CLIENT_OWNER`** users only (not all org staff).

| Trigger | Recipients | Title (typical) | `payload.action` |
|---------|------------|-----------------|------------------|
| `POST /auth/register/submit` | Submitting user | Application submitted | `VIEW_APPLICATION` |
| Org `VERIFIED` | Org owners | Business approved | `COMPLETE_SITE_SETUP` |
| Org `REJECTED` | Org owners | Application needs attention | `VIEW_REJECTION` |
| Guardian activate / suspend | Guardian user | Account activated / suspended | — |
| Job create / cancel | Org owners | Job created / cancelled | `VIEW_JOB` |
| Dispatch offer sent | Guardian | New job offer | `VIEW_OFFER` |
| Dispatch offer expired | Guardian | Offer expired | `VIEW_ASSIGNMENTS` |
| Early release requested | Org owners | Early release requested | `REVIEW_EARLY_RELEASE` |
| Early release approved / denied / auto-approved | Guardian | Early release approved / denied | — |
| Replacement requested | Ops admins | Replacement requested | `REVIEW_REPLACEMENT` |
| Replacement denied | Guardian | Replacement denied | — |
| Replacement approved | Guardian | Replacement approved | — |
| Replacement handoff | Org owners | Officer replaced | — |
| Draft invoice created | Org owners | Invoice awaiting confirmation | `REVIEW_INVOICE` |
| Invoice issued | Org owners | Invoice issued | `VIEW_INVOICE` |
| Invoice disputed / resolved / voided | Org owners | Invoice disputed / resolved / voided | `VIEW_INVOICE` |
| Payment confirmed | Org owners | Payment confirmed | `VIEW_INVOICE` |
| Guardian payout confirmed | Guardian user | Payout confirmed | `VIEW_EARNINGS` |

Offer **decline** (guardian-initiated) does not create an in-app notification — only audit logs.

## Skipped sends

Email is skipped (without failing the request) when:

- Recipient has no email on file
- SMTP is not configured (non-production may log only)

## Related

- [auth.md](auth.md) — password and registration flows
- [admin-onboarding.md](admin-onboarding.md) — guardian credentials
- [admin.md](admin.md) — verification and guardian admin routes
- [replacement.md](replacement.md) — replacement handoff workflow
