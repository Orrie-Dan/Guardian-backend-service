import { BillingPolicyModel, EarlyReleaseResolution } from '@prisma/client';
import {
  effectiveBillingModelForInvoice,
  isEarlyReleaseApproved,
} from './early-release.util';

describe('early-release.util', () => {
  it('detects approved resolutions', () => {
    expect(isEarlyReleaseApproved(EarlyReleaseResolution.APPROVED)).toBe(true);
    expect(isEarlyReleaseApproved(EarlyReleaseResolution.AUTO_APPROVED)).toBe(true);
    expect(isEarlyReleaseApproved(EarlyReleaseResolution.REJECTED)).toBe(false);
    expect(isEarlyReleaseApproved(null)).toBe(false);
  });

  it('prorates BOOKED_BLOCK to ACTUAL_TIME when early release approved', () => {
    expect(
      effectiveBillingModelForInvoice(
        BillingPolicyModel.BOOKED_BLOCK,
        true,
        true,
      ),
    ).toBe(BillingPolicyModel.ACTUAL_TIME);
  });

  it('keeps BOOKED_BLOCK when proration disabled', () => {
    expect(
      effectiveBillingModelForInvoice(
        BillingPolicyModel.BOOKED_BLOCK,
        true,
        false,
      ),
    ).toBe(BillingPolicyModel.BOOKED_BLOCK);
  });
});
