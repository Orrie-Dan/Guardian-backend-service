/** Earth radius in meters (WGS84 mean). */
const EARTH_RADIUS_M = 6_371_000;

/** Fallback speed when guardian speed is unknown (~30 km/h). */
const DEFAULT_SPEED_MPS = 30 / 3.6;

/** Minimum speed used for ETA when reported speed is very low (idle GPS noise). */
const MIN_ETA_SPEED_MPS = 1;

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export function parseCoordinate(value: string | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Rough ETA in whole minutes from straight-line distance and optional speed (m/s).
 */
export function estimateEtaMinutes(
  distanceMeters: number,
  speedMps: string | null | undefined,
): number {
  const parsed = speedMps != null ? Number(speedMps) : NaN;
  const speed =
    Number.isFinite(parsed) && parsed >= MIN_ETA_SPEED_MPS
      ? parsed
      : DEFAULT_SPEED_MPS;
  const seconds = distanceMeters / speed;
  return Math.max(1, Math.ceil(seconds / 60));
}
