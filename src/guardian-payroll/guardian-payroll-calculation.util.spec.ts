import { PayPolicyModel } from '@prisma/client';
import {
  computePayableDuration,
  computePayableHours,
  effectivePayModelForEarning,
} from './guardian-payroll-calculation.util';

describe('computePayableDuration', () => {
  const scheduledStart = new Date('2026-06-01T08:00:00.000Z');
  const scheduledEnd = new Date('2026-06-01T16:00:00.000Z');
  const arrivedAt = new Date('2026-06-01T08:00:00.000Z');

  it('ACTUAL_TIME uses capped actual hours', () => {
    const result = computePayableDuration(
      PayPolicyModel.ACTUAL_TIME,
      1,
      scheduledStart,
      scheduledEnd,
      arrivedAt,
      new Date('2026-06-01T11:00:00.000Z'),
    );
    expect(result.payableHours).toBe(3);
    expect(result.payBasis).toBe('ACTUAL_TIME');
  });

  it('MINIMUM_GUARANTEED floors at minimum when actual is shorter', () => {
    const result = computePayableDuration(
      PayPolicyModel.MINIMUM_GUARANTEED,
      1,
      scheduledStart,
      scheduledEnd,
      arrivedAt,
      new Date('2026-06-01T08:30:00.000Z'),
    );
    expect(result.actualHours).toBe(0.5);
    expect(result.payableHours).toBe(1);
    expect(result.payBasis).toBe('MINIMUM_GUARANTEED');
  });

  it('MINIMUM_GUARANTEED uses actual when above minimum', () => {
    const result = computePayableDuration(
      PayPolicyModel.MINIMUM_GUARANTEED,
      1,
      scheduledStart,
      scheduledEnd,
      arrivedAt,
      new Date('2026-06-01T11:00:00.000Z'),
    );
    expect(result.payableHours).toBe(3);
  });

  it('caps payable hours at scheduled window', () => {
    const result = computePayableDuration(
      PayPolicyModel.MINIMUM_GUARANTEED,
      1,
      scheduledStart,
      scheduledEnd,
      arrivedAt,
      new Date('2026-06-01T20:00:00.000Z'),
    );
    expect(result.payableHours).toBe(8);
  });

  it('waives minimum on approved early release when applyOnEarlyRelease is false', () => {
    const result = computePayableDuration(
      PayPolicyModel.MINIMUM_GUARANTEED,
      1,
      scheduledStart,
      scheduledEnd,
      arrivedAt,
      new Date('2026-06-01T08:30:00.000Z'),
      true,
      false,
    );
    expect(result.payableHours).toBe(0.5);
    expect(result.payBasis).toBe('MINIMUM_GUARANTEED_EARLY_RELEASE_ACTUAL');
  });
});

describe('effectivePayModelForEarning', () => {
  it('keeps model when early release still applies minimum', () => {
    expect(
      effectivePayModelForEarning(
        PayPolicyModel.MINIMUM_GUARANTEED,
        true,
        true,
      ),
    ).toBe(PayPolicyModel.MINIMUM_GUARANTEED);
  });
});

describe('computePayableHours (legacy)', () => {
  it('uses actual hours when under scheduled window', () => {
    const hours = computePayableHours(
      new Date('2026-06-01T08:00:00.000Z'),
      new Date('2026-06-01T16:00:00.000Z'),
      new Date('2026-06-01T08:00:00.000Z'),
      new Date('2026-06-01T11:00:00.000Z'),
    );
    expect(hours).toBe(3);
  });
});
