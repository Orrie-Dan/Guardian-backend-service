/** Stable template keys for transactional email. */
export enum EmailTemplateId {
  SECURITY_OTP_CODE = 'security.otpCode',
  SECURITY_PASSWORD_RESET_REQUESTED = 'security.passwordResetRequested',
  SECURITY_PASSWORD_RESET_COMPLETED = 'security.passwordResetCompleted',
  SECURITY_PASSWORD_SET = 'security.passwordSet',

  ONBOARDING_APPLICATION_SUBMITTED = 'onboarding.applicationSubmitted',

  VERIFICATION_ORG_APPROVED = 'verification.orgApproved',
  VERIFICATION_ORG_REJECTED = 'verification.orgRejected',

  GUARDIAN_ACTIVATED = 'guardian.activated',
  GUARDIAN_SUSPENDED = 'guardian.suspended',

  JOB_CREATED = 'job.created',
  JOB_CANCELLED = 'job.cancelled',
  JOB_COMPLETED = 'job.completed',
  DISPATCH_OFFER_RECEIVED = 'dispatch.offerReceived',

  BILLING_INVOICE_ISSUED = 'billing.invoiceIssued',
  BILLING_INVOICE_VOIDED = 'billing.invoiceVoided',
  BILLING_PAYMENT_CONFIRMED = 'billing.paymentConfirmed',
}

export type EmailTemplatePayload = Record<string, string | number | undefined>;
