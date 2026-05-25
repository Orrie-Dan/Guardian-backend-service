/** Approximate district centroids for Rwanda (WGS84). Used at registration when users do not provide coordinates. */
export const DISTRICT_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  Gasabo: { latitude: -1.9441, longitude: 30.1043 },
  Kicukiro: { latitude: -1.9897, longitude: 30.1129 },
  Nyarugenge: { latitude: -1.9706, longitude: 30.1044 },
  Bugesera: { latitude: -2.1557, longitude: 30.2306 },
  Gatsibo: { latitude: -1.6728, longitude: 30.4348 },
  Kayonza: { latitude: -1.858, longitude: 30.5783 },
  Kirehe: { latitude: -2.165, longitude: 30.6438 },
  Ngoma: { latitude: -2.3144, longitude: 30.5456 },
  Nyagatare: { latitude: -1.2928, longitude: 30.6786 },
  Rwamagana: { latitude: -1.9487, longitude: 30.4347 },
  Huye: { latitude: -2.5967, longitude: 29.7394 },
  Kamonyi: { latitude: -2.0311, longitude: 29.8789 },
  Muhanga: { latitude: -2.0838, longitude: 29.754 },
  Nyamagabe: { latitude: -2.484, longitude: 29.559 },
  Nyanza: { latitude: -2.3517, longitude: 29.7509 },
  Nyaruguru: { latitude: -2.481, longitude: 29.589 },
  Ruhango: { latitude: -2.256, longitude: 29.789 },
  Karongi: { latitude: -2.062, longitude: 29.348 },
  Ngororero: { latitude: -1.868, longitude: 29.64 },
  Nyabihu: { latitude: -1.658, longitude: 29.52 },
  Nyamasheke: { latitude: -2.408, longitude: 29.088 },
  Rubavu: { latitude: -1.693, longitude: 29.256 },
  Rutsiro: { latitude: -2.067, longitude: 29.344 },
  Burera: { latitude: -1.558, longitude: 29.86 },
  Gakenke: { latitude: -1.672, longitude: 29.758 },
  Gicumbi: { latitude: -1.576, longitude: 30.065 },
  Musanze: { latitude: -1.499, longitude: 29.635 },
  Rulindo: { latitude: -1.741, longitude: 29.93 },
};

export function normalizeDistrictName(district: string): string {
  const trimmed = district.trim();
  const match = Object.keys(DISTRICT_COORDINATES).find(
    (d) => d.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? trimmed;
}

export function resolveDistrictCoordinates(district: string): {
  latitude: number;
  longitude: number;
  district: string;
} | null {
  const key = normalizeDistrictName(district);
  const coords = DISTRICT_COORDINATES[key];
  if (!coords) {
    return null;
  }
  return { ...coords, district: key };
}
