function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Minutes before scheduled end that counts as early completion. */
export const BILLING_OPS_EARLY_COMPLETION_MINUTES = parsePositiveIntEnv(
  'BILLING_OPS_EARLY_COMPLETION_MINUTES',
  30,
);

/** Minutes after scheduled start that counts as late arrival. */
export const BILLING_OPS_LATE_ARRIVAL_MINUTES = parsePositiveIntEnv(
  'BILLING_OPS_LATE_ARRIVAL_MINUTES',
  15,
);

/** How far back each scan looks for new anomalies (hours). */
export const BILLING_OPS_SCAN_LOOKBACK_HOURS = parsePositiveIntEnv(
  'BILLING_OPS_SCAN_LOOKBACK_HOURS',
  24,
);

export const BILLING_OPS_SCAN_INTERVAL_MS = 60_000;

export const BILLING_ALERT_EARLY_COMPLETION = 'BILLING_ALERT_EARLY_COMPLETION';
export const BILLING_ALERT_LATE_ARRIVAL = 'BILLING_ALERT_LATE_ARRIVAL';
export const BILLING_OPS_ALERT_ENTITY_TYPE = 'billing.ops_alert';

/** Reconciliation rows below this count are flagged as low sample size. */
export const BILLING_OPS_LOW_SAMPLE_THRESHOLD = 20;
