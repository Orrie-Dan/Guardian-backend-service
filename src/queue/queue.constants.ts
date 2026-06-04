export const DISPATCH_QUEUE = 'dispatch';
export const OFFER_EXPIRY_QUEUE = 'offer-expiry';
export const CONNECTIVITY_QUEUE = 'connectivity';

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const OFFER_TTL_MS = parsePositiveIntEnv('DISPATCH_OFFER_TTL_MS', 90_000);
/** Max time to keep searching for a guardian before job moves to FAILED. */
export const DISPATCH_WINDOW_MS = parsePositiveIntEnv('DISPATCH_WINDOW_MS', 600_000);
/** @deprecated No longer used for failure; kept for backward compatibility. */
export const MAX_DISPATCH_ATTEMPTS = parsePositiveIntEnv('MAX_DISPATCH_ATTEMPTS', 3);
export const DISPATCH_POOL_SIZE = parsePositiveIntEnv('DISPATCH_POOL_SIZE', 50);
/** Safety cap on offers per job to prevent runaway loops. */
export const MAX_OFFERS_PER_JOB = parsePositiveIntEnv('MAX_OFFERS_PER_JOB', 20);
/** Fail when eligible guardians exist but none are reachable for this long. */
export const DISPATCH_UNREACHABLE_GRACE_MS = parsePositiveIntEnv(
  'DISPATCH_UNREACHABLE_GRACE_MS',
  120_000,
);
/** Parallel offers for URGENT priority jobs. */
export const URGENT_PARALLEL_OFFERS = parsePositiveIntEnv('URGENT_PARALLEL_OFFERS', 3);
/** @deprecated Use DISPATCH_POOL_SIZE */
export const CANDIDATE_POOL_SIZE = DISPATCH_POOL_SIZE;
