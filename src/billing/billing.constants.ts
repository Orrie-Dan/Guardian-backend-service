function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Hours after guardian complete before invoice auto-issues if client does not confirm. */
export const BILLING_AUTO_CONFIRM_HOURS = parsePositiveIntEnv(
  'BILLING_AUTO_CONFIRM_HOURS',
  24,
);

export const BILLING_AUTO_CONFIRM_MS = BILLING_AUTO_CONFIRM_HOURS * 60 * 60 * 1000;

export const OUTBOX_EVENT_JOB_BILLING_AUTO_CONFIRM = 'JOB_BILLING_AUTO_CONFIRM';
