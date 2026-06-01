import {
  estimateEtaMinutes,
  haversineDistanceMeters,
  parseCoordinate,
} from './geo.util';

describe('geo.util', () => {
  it('haversineDistanceMeters returns ~0 for same point', () => {
    expect(haversineDistanceMeters(-1.95, 30.06, -1.95, 30.06)).toBeLessThan(1);
  });

  it('haversineDistanceMeters is positive for distinct points', () => {
    const d = haversineDistanceMeters(-1.95, 30.06, -1.94, 30.07);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(20_000);
  });

  it('parseCoordinate rejects invalid values', () => {
    expect(parseCoordinate('bad')).toBeNull();
    expect(parseCoordinate('-1.95')).toBe(-1.95);
  });

  it('estimateEtaMinutes uses at least 1 minute', () => {
    expect(estimateEtaMinutes(100, null)).toBeGreaterThanOrEqual(1);
  });
});
