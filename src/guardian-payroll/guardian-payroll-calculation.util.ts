import { PayPolicyModel } from '@prisma/client';

const MS_PER_HOUR = 1000 * 60 * 60;

export function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / MS_PER_HOUR);
}

export type PayableDurationResult = {
  scheduledHours: number;
  actualHours: number;
  payableHours: number;
  payBasis: string;
  minimumHours: number;
};

export type PayPolicySnapshot = {
  model: PayPolicyModel;
  minimumHours: number;
  applyOnEarlyRelease: boolean;
};

/** Effective model when early release is approved and policy waives minimum on early finish. */
export function effectivePayModelForEarning(
  policyModel: PayPolicyModel,
  earlyReleaseApproved: boolean,
  applyOnEarlyRelease: boolean,
): PayPolicyModel {
  if (earlyReleaseApproved && !applyOnEarlyRelease) {
    return PayPolicyModel.ACTUAL_TIME;
  }
  return policyModel;
}

export function computePayableDuration(
  policyModel: PayPolicyModel,
  minimumHours: number,
  scheduledStart: Date,
  scheduledEnd: Date,
  arrivedAt: Date,
  completedAt: Date,
  earlyReleaseApproved = false,
  applyOnEarlyRelease = true,
): PayableDurationResult {
  const scheduledHours = hoursBetween(scheduledStart, scheduledEnd);
  const actualHours = hoursBetween(arrivedAt, completedAt);
  const minHours = Number(minimumHours);
  const cappedActual = Math.min(scheduledHours, actualHours);
  const effectiveModel = effectivePayModelForEarning(
    policyModel,
    earlyReleaseApproved,
    applyOnEarlyRelease,
  );

  let payableHours: number;
  switch (effectiveModel) {
    case PayPolicyModel.ACTUAL_TIME:
      payableHours = cappedActual;
      break;
    case PayPolicyModel.MINIMUM_GUARANTEED:
      payableHours = Math.max(minHours, cappedActual);
      break;
    default:
      payableHours = cappedActual;
  }

  let payBasis = String(effectiveModel);
  if (earlyReleaseApproved && !applyOnEarlyRelease && policyModel !== effectiveModel) {
    payBasis = `${policyModel}_EARLY_RELEASE_ACTUAL`;
  }

  return {
    scheduledHours,
    actualHours,
    payableHours,
    payBasis,
    minimumHours: minHours,
  };
}

/** @deprecated Use computePayableDuration with assignment pay policy snapshot. */
export function computePayableHours(
  scheduledStart: Date,
  scheduledEnd: Date,
  arrivedAt: Date,
  completedAt: Date,
): number {
  return computePayableDuration(
    PayPolicyModel.ACTUAL_TIME,
    0,
    scheduledStart,
    scheduledEnd,
    arrivedAt,
    completedAt,
  ).payableHours;
}
