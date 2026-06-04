/** Normalize district strings for consistent dispatch matching. */
export function normalizeDistrict(value: string): string {
  return value.trim().toLowerCase();
}
