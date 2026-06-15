import { computePayableHours } from './guardian-payroll-calculation.util';

describe('computePayableHours', () => {
  const scheduledStart = new Date('2026-06-01T08:00:00.000Z');
  const scheduledEnd = new Date('2026-06-01T16:00:00.000Z');

  it('uses actual hours when under scheduled window', () => {
    const hours = computePayableHours(
      scheduledStart,
      scheduledEnd,
      new Date('2026-06-01T08:00:00.000Z'),
      new Date('2026-06-01T11:00:00.000Z'),
    );
    expect(hours).toBe(3);
  });

  it('caps at scheduled hours when actual exceeds window', () => {
    const hours = computePayableHours(
      scheduledStart,
      scheduledEnd,
      new Date('2026-06-01T08:00:00.000Z'),
      new Date('2026-06-01T20:00:00.000Z'),
    );
    expect(hours).toBe(8);
  });
});
