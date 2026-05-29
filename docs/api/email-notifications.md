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
| `onboarding.applicationSubmitted` | `POST /auth/register/submit` | Submitting user email | |
| `verification.orgApproved` | `PATCH /admin/verification/organizations/:id` → `VERIFIED` | Org `CLIENT_OWNER` emails | In-app notification also sent |
| `verification.orgRejected` | `PATCH /admin/verification/organizations/:id` → `REJECTED` | Org `CLIENT_OWNER` emails | Includes rejection reason |
| `guardian.activated` | `POST /admin/guardians/:id/activate` | Guardian user email | Account notice; OTP also via `security.otpCode` |
| `guardian.suspended` | `POST /admin/guardians/:id/suspend` | Guardian user email | |
| *(credentials)* | `POST /admin/guardians` | Guardian email or SMS fallback | See credential delivery service |
| `job.created` | Job create | Org owners | |
| `job.cancelled` | Job cancel | Org owners | |
| `job.completed` | Job complete (dispatch) | Org owners | |
| `dispatch.offerReceived` | Guardian offered on dispatch | Guardian user email | Offer declined/expired are in-app only |
| `billing.invoiceIssued` | Admin invoice issue | Org owners | |
| `billing.invoiceVoided` | Admin invoice void | Org owners | |
| `billing.paymentConfirmed` | Payment confirm | Org owners | |

## Skipped sends

Email is skipped (without failing the request) when:

- Recipient has no email on file
- SMTP is not configured (non-production may log only)

## Related

- [auth.md](auth.md) — password and registration flows
- [admin-onboarding.md](admin-onboarding.md) — guardian credentials
- [admin.md](admin.md) — verification and guardian admin routes
