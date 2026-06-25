function parsePositiveNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Fallback minimum pay hours when no PayPolicy row matches (legacy assignments). */
export const GUARDIAN_PAY_MINIMUM_HOURS_FALLBACK = parsePositiveNumberEnv(
  'GUARDIAN_PAY_MINIMUM_HOURS',
  1,
);
