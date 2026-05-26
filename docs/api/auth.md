# Auth API



Base path: `/api/v1/auth`



Swagger: `/docs` → tag **auth**



## Client registration



See **[onboarding.md](onboarding.md)** for the phone-first v2 flow (`/auth/register/start` through `/auth/register/submit`).



## Sign-in (existing users)



| Method | Path | Description |

|--------|------|-------------|

| POST | `/auth/sign-in/otp/request` | OTP for registered users |

| POST | `/auth/sign-in/otp/verify` | Verify sign-in OTP |

| POST | `/auth/sign-in/password` | Primary login (phone or email + password) |

| POST | `/auth/password/set` | Setup token or authenticated password change |

| POST | `/auth/refresh` | Rotate refresh token |

| POST | `/auth/logout` | Revoke refresh token |

| POST | `/auth/context` | Switch active organization |



## Deprecated aliases



| Endpoint | Replacement |

|----------|-------------|

| `POST /auth/otp/request` | `POST /auth/sign-in/otp/request` |

| `POST /auth/otp/verify` | `POST /auth/sign-in/otp/verify` |



**Guardians cannot self-register.** Use `POST /admin/guardians` — see [admin-onboarding.md](admin-onboarding.md).

### Password sign-in body

`POST /auth/sign-in/password`

```json
{
  "login": "+250788123456",
  "password": "YourPassword"
}
```

| Field | Description |
|-------|-------------|
| `login` | **Phone** (E.164, e.g. `+250788123456`) **or email** (case-insensitive) |
| `password` | Account password (min 8 characters) |

Detection: if `login` contains `@`, it is treated as email; otherwise as phone (same normalization as OTP sign-in).

Examples:

- Client / guardian: `"login": "+250788000002"`
- Ops admin: `"login": "ops@company.rw"` (user must have `email` set in `identity.users`)

## Error codes



| Code | When |

|------|------|

| `USER_NOT_REGISTERED` | Sign-in for unknown phone |

| `PHONE_ALREADY_REGISTERED` | Completed registration exists |

| `ONBOARDING_INCOMPLETE` | Sign-in before `POST /auth/register/submit` |

| `INVALID_CREDENTIALS` | Unknown login or wrong password |
| `INVALID_LOGIN` | Empty or malformed `login` (bad email format) |

| `ONBOARDING_TOKEN_INVALID` | Bad onboarding JWT (registration steps) |



See [onboarding.md](onboarding.md) for full registration and booking error codes.



## Client lifecycle



1. Complete registration → submit → sign in (org `PENDING`).

2. Admin verifies org → notification to complete site.

3. `POST /organizations/:id/locations/primary/complete-site` → `canBookJobs: true`.



`GET /users/me` returns `canBookJobs`, `needsSiteSetup`, `primaryLocationId`, and `permissions` per organization.



## Access token payload



Claims include `activeOrgId`, `organizationIds`, and `orgId` (alias). Use `POST /auth/context` when the user belongs to multiple organizations.



## Development OTP



When `NODE_ENV !== production`, OTP request responses include `devCode` for local testing.



## Related



- [onboarding.md](onboarding.md) — registration + complete site
- [admin-onboarding.md](admin-onboarding.md) — guardian onboarding (admin)
- [user-journeys.md](../user-journeys.md)
- [admin.md](admin.md)

- [changelog.md](changelog.md)


