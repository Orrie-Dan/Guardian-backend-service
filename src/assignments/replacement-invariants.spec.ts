import { BadRequestException } from '@nestjs/common';
import { AssignmentStatus } from '@prisma/client';
import { assertSeekingReplacementState } from './replacement-invariants';

describe('assertSeekingReplacementState', () => {
  it('accepts departing AWAITING_RELIEF with no substitute', () => {
    expect(() =>
      assertSeekingReplacementState(
        { status: AssignmentStatus.AWAITING_RELIEF },
        null,
      ),
    ).not.toThrow();
  });

  it('accepts departing AWAITING_RELIEF with substitute in pipeline', () => {
    expect(() =>
      assertSeekingReplacementState(
        { status: AssignmentStatus.AWAITING_RELIEF },
        { status: AssignmentStatus.EN_ROUTE },
      ),
    ).not.toThrow();
  });

  it('rejects when departing is not AWAITING_RELIEF', () => {
    expect(() =>
      assertSeekingReplacementState({ status: AssignmentStatus.ON_SITE }, null),
    ).toThrow(BadRequestException);
  });

  it('rejects invalid substitute status', () => {
    expect(() =>
      assertSeekingReplacementState(
        { status: AssignmentStatus.AWAITING_RELIEF },
        { status: AssignmentStatus.ON_SITE },
      ),
    ).toThrow(BadRequestException);
  });
});
