import { BillingPolicyModel, EarlyReleaseResolution } from '@prisma/client';

export const EARLY_RELEASE_APPROVED_RESOLUTIONS = new Set<EarlyReleaseResolution>([
  EarlyReleaseResolution.APPROVED,
  EarlyReleaseResolution.AUTO_APPROVED,
]);

export function isEarlyReleaseApproved(
  resolution: EarlyReleaseResolution | null | undefined,
): boolean {
  return resolution != null && EARLY_RELEASE_APPROVED_RESOLUTIONS.has(resolution);
}

/** When early release is approved and proration is on, BOOKED_BLOCK bills actual time. */
export function effectiveBillingModelForInvoice(
  policyModel: BillingPolicyModel,
  earlyReleaseApproved: boolean,
  prorationEnabled: boolean,
): BillingPolicyModel {
  if (
    earlyReleaseApproved &&
    prorationEnabled &&
    policyModel === BillingPolicyModel.BOOKED_BLOCK
  ) {
    return BillingPolicyModel.ACTUAL_TIME;
  }
  return policyModel;
}
