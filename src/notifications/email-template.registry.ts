import { EmailTemplateId, EmailTemplatePayload } from './email-template.ids';
import { buildRenderedEmail } from './email-layout';

export type RenderedEmail = { subject: string; text: string; html: string };

const OTP_EMAIL_BY_PURPOSE: Record<
  string,
  { subject: string; paragraphs: string[] }
> = {
  sign_in: {
    subject: 'Your G2 Sentry sign-in code',
    paragraphs: ['Use this code to sign in to your G2 Sentry account.'],
  },
  password_reset: {
    subject: 'Your G2 Sentry password reset code',
    paragraphs: ['Use this code to reset your G2 Sentry account password.'],
  },
  guardian_activation: {
    subject: 'Your G2 Sentry guardian activation code',
    paragraphs: ['Use this code to verify your guardian account activation.'],
  },
  general: {
    subject: 'Your G2 Sentry verification code',
    paragraphs: ['Use this code to continue on G2 Sentry.'],
  },
};

export function renderEmailTemplate(
  templateId: EmailTemplateId,
  payload: EmailTemplatePayload,
): RenderedEmail {
  const name = String(payload.fullName ?? 'there');
  const orgName = String(payload.organizationName ?? 'your organization');
  const jobRef = String(payload.jobReference ?? payload.jobId ?? '—');
  const reason = String(payload.reason ?? 'No reason provided.');

  switch (templateId) {
    case EmailTemplateId.SECURITY_OTP_CODE: {
      const purpose = String(payload.purpose ?? 'general');
      const copy =
        OTP_EMAIL_BY_PURPOSE[purpose] ?? OTP_EMAIL_BY_PURPOSE.general;
      const code = String(payload.otpCode ?? '------');
      return buildRenderedEmail(copy.subject, {
        greetingName: name,
        paragraphs: [
          ...copy.paragraphs,
          'We also sent this code to your registered phone number by SMS when available.',
        ],
        callouts: [{ label: 'Verification code', value: code }],
        footerNote:
          'This code expires in 5 minutes. If you did not request this, contact support immediately.',
      });
    }

    case EmailTemplateId.SECURITY_PASSWORD_RESET_REQUESTED:
      return buildRenderedEmail('G2 Sentry password reset requested', {
        greetingName: name,
        paragraphs: [
          'A password reset was requested for your G2 Sentry account.',
          'If you initiated this, use the verification code sent to your phone or email.',
          'If you did not request this, contact support immediately.',
        ],
      });

    case EmailTemplateId.SECURITY_PASSWORD_RESET_COMPLETED:
      return buildRenderedEmail('Your G2 Sentry password was reset', {
        greetingName: name,
        paragraphs: [
          'Your password was successfully reset.',
          'If you did not make this change, contact support immediately.',
        ],
      });

    case EmailTemplateId.SECURITY_PASSWORD_SET:
      return buildRenderedEmail('Your G2 Sentry password was updated', {
        greetingName: name,
        paragraphs: [
          'Your account password was set or changed successfully.',
          'If you did not make this change, contact support immediately.',
        ],
      });

    case EmailTemplateId.ONBOARDING_APPLICATION_SUBMITTED:
      return buildRenderedEmail('G2 Sentry application received', {
        greetingName: name,
        paragraphs: [
          `We received your application for ${orgName}.`,
          'Our team will review it and notify you when a decision is made.',
        ],
      });

    case EmailTemplateId.VERIFICATION_ORG_APPROVED:
      return buildRenderedEmail('Your business was approved on G2 Sentry', {
        greetingName: name,
        paragraphs: [
          `${orgName} has been approved.`,
          'Sign in and complete your primary site setup to start booking security services.',
        ],
      });

    case EmailTemplateId.VERIFICATION_ORG_REJECTED:
      return buildRenderedEmail('Your G2 Sentry application needs attention', {
        greetingName: name,
        paragraphs: [
          `Your application for ${orgName} was not approved.`,
          'Sign in to review details and resubmit if applicable.',
        ],
        callouts: [{ label: 'Reason', value: reason }],
      });

    case EmailTemplateId.GUARDIAN_ACTIVATED:
      return buildRenderedEmail('Your G2 Sentry guardian account is active', {
        greetingName: name,
        paragraphs: [
          'Your guardian account has been activated.',
          'Sign in with your credentials, change your password if prompted, then start your shift when ready.',
        ],
      });

    case EmailTemplateId.GUARDIAN_SUSPENDED:
      return buildRenderedEmail('Your G2 Sentry guardian account was suspended', {
        greetingName: name,
        paragraphs: [
          'Your guardian account has been suspended and you cannot receive assignments.',
          'Contact operations if you believe this is an error.',
        ],
      });

    case EmailTemplateId.GUARDIAN_PAYOUT_CONFIRMED:
      return buildRenderedEmail('Your G2 Sentry payout was sent', {
        greetingName: name,
        paragraphs: [
          `A payout of ${payload.currency ?? 'RWF'} ${payload.amount ?? ''} has been confirmed.`,
          'Sign in to view your earnings history.',
        ],
      });

    case EmailTemplateId.JOB_CREATED:
      return buildRenderedEmail(`Job ${jobRef} created`, {
        greetingName: name,
        paragraphs: [
          `A new security job (${jobRef}) was created for ${orgName}.`,
          'We will notify you as dispatch progresses.',
        ],
        callouts: [{ label: 'Job reference', value: jobRef }],
      });

    case EmailTemplateId.JOB_CANCELLED: {
      const paragraphs = [`Job ${jobRef} for ${orgName} was cancelled.`];
      const callouts =
        reason !== 'No reason provided.'
          ? [{ label: 'Reason', value: reason }]
          : undefined;
      return buildRenderedEmail(`Job ${jobRef} cancelled`, {
        greetingName: name,
        paragraphs,
        callouts,
      });
    }

    case EmailTemplateId.ASSIGNMENT_EARLY_RELEASE_REQUESTED:
      return buildRenderedEmail(`Early release requested — job ${jobRef}`, {
        greetingName: name,
        paragraphs: [
          `A guardian has requested to end job ${jobRef} for ${orgName} before the scheduled end time.`,
          'Review and approve or reject in the client app.',
        ],
        callouts: [
          { label: 'Job reference', value: jobRef },
          { label: 'Reason', value: String(payload.reason ?? '—') },
        ],
      });

    case EmailTemplateId.ASSIGNMENT_REPLACEMENT_REQUESTED:
      return buildRenderedEmail(`Replacement requested — job ${jobRef}`, {
        greetingName: name,
        paragraphs: [
          `A guardian on job ${jobRef} has requested a replacement.`,
          'Review and approve or deny in the admin console.',
        ],
        callouts: [
          { label: 'Job reference', value: jobRef },
          { label: 'Reason', value: String(payload.reason ?? '—') },
        ],
      });

    case EmailTemplateId.ASSIGNMENT_REPLACEMENT_DISPATCH_PAUSED:
      return buildRenderedEmail(`Replacement dispatch paused — job ${jobRef}`, {
        greetingName: name,
        paragraphs: [
          `Automatic replacement dispatch for job ${jobRef} has been paused.`,
          'A departing officer is still awaiting relief. Resume dispatch or cancel the job in the admin console.',
        ],
        callouts: [
          { label: 'Job reference', value: jobRef },
          { label: 'Reason', value: String(payload.reason ?? '—') },
        ],
      });

    case EmailTemplateId.ASSIGNMENT_REPLACEMENT_COMPLETED:
      return buildRenderedEmail(`Officer replaced — job ${jobRef}`, {
        greetingName: name,
        paragraphs: [
          `Coverage for job ${jobRef} at ${orgName} has been transferred to a replacement officer.`,
          'The new officer is on site. Tracking remains available in your app.',
        ],
        callouts: [
          { label: 'Job reference', value: jobRef },
          { label: 'Replacement officer', value: String(payload.guardianName ?? '—') },
        ],
      });

    case EmailTemplateId.DISPATCH_OFFER_RECEIVED:
      return buildRenderedEmail(`New assignment offer — job ${jobRef}`, {
        greetingName: name,
        paragraphs: [
          `You have a new job offer (${jobRef}).`,
          'Open the guardian app to accept or decline before the offer expires.',
        ],
        callouts: [{ label: 'Job reference', value: jobRef }],
      });

    case EmailTemplateId.BILLING_INVOICE_AWAITING_CONFIRMATION: {
      const amount = `${payload.amount ?? '—'} ${payload.currency ?? ''}`.trim();
      const billableHours = String(payload.billableHours ?? '—');
      const billingBasis = String(payload.billingBasis ?? '—');
      return buildRenderedEmail(`Job ${jobRef} — confirm billing`, {
        greetingName: name,
        paragraphs: [
          `Guardian work on job ${jobRef} for ${orgName} is complete.`,
          'Review the draft invoice below and confirm in the app to issue the invoice.',
        ],
        callouts: [
          { label: 'Job reference', value: jobRef },
          { label: 'Billing basis', value: billingBasis },
          { label: 'Billable hours', value: billableHours },
          { label: 'Estimated total', value: amount },
        ],
      });
    }

    case EmailTemplateId.BILLING_INVOICE_ISSUED: {
      const amount = `${payload.amount ?? '—'} ${payload.currency ?? ''}`.trim();
      return buildRenderedEmail(`Job ${jobRef} completed — invoice ready`, {
        greetingName: name,
        paragraphs: [
          `Job ${jobRef} for ${orgName} is complete.`,
          'Your invoice is ready — sign in to view and pay.',
        ],
        callouts: [
          { label: 'Job reference', value: jobRef },
          { label: 'Amount', value: amount },
        ],
      });
    }

    case EmailTemplateId.BILLING_INVOICE_DISPUTED:
      return buildRenderedEmail(`Invoice disputed — job ${jobRef}`, {
        greetingName: name,
        paragraphs: [
          `An invoice for ${orgName} (job ${jobRef}) was disputed.`,
          'Our team will review and follow up.',
        ],
        callouts: [
          { label: 'Job reference', value: jobRef },
          { label: 'Reason', value: reason },
        ],
      });

    case EmailTemplateId.BILLING_INVOICE_DISPUTE_RESOLVED:
      return buildRenderedEmail(`Dispute resolved — job ${jobRef}`, {
        greetingName: name,
        paragraphs: [
          `The billing dispute for ${orgName} (job ${jobRef}) was resolved.`,
        ],
        callouts: [
          { label: 'Job reference', value: jobRef },
          { label: 'Resolution', value: reason },
        ],
      });

    case EmailTemplateId.BILLING_INVOICE_VOIDED:
      return buildRenderedEmail(`Invoice voided for job ${jobRef}`, {
        greetingName: name,
        paragraphs: [
          `An invoice for ${orgName} (job ${jobRef}) was voided.`,
        ],
        callouts: [
          { label: 'Job reference', value: jobRef },
          { label: 'Reason', value: reason },
        ],
      });

    case EmailTemplateId.BILLING_PAYMENT_CONFIRMED: {
      const amount = `${payload.amount ?? '—'} ${payload.currency ?? ''}`.trim();
      return buildRenderedEmail(`Payment received for job ${jobRef}`, {
        greetingName: name,
        paragraphs: [
          `Payment was confirmed for ${orgName} (job ${jobRef}).`,
        ],
        callouts: [
          { label: 'Job reference', value: jobRef },
          { label: 'Amount', value: amount },
        ],
      });
    }

    default:
      return buildRenderedEmail('G2 Sentry notification', {
        greetingName: name,
        paragraphs: ['You have a new notification from G2 Sentry.'],
      });
  }
}
