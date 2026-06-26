import { AssignmentStatus, Prisma } from '@prisma/client';
import { lockAssignmentRow, transitionOfferedAssignment } from './assignment-accept.util';

describe('assignment-accept.util', () => {
  const tx = {
    $executeRaw: jest.fn(),
    jobAssignment: {
      updateMany: jest.fn(),
    },
  } as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('transitionOfferedAssignment requires OFFERED status in where clause', async () => {
    (tx.jobAssignment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await transitionOfferedAssignment(tx, 'a-1', 2, {
      status: AssignmentStatus.ACCEPTED,
      acceptedAt: new Date(),
    });

    expect(tx.jobAssignment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'a-1',
        versionNumber: 2,
        status: AssignmentStatus.OFFERED,
      },
      data: expect.objectContaining({
        status: AssignmentStatus.ACCEPTED,
        versionNumber: { increment: 1 },
      }),
    });
  });

  it('returns zero when offer was cancelled concurrently', async () => {
    (tx.jobAssignment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const count = await transitionOfferedAssignment(tx, 'a-1', 2, {
      status: AssignmentStatus.ACCEPTED,
    });

    expect(count).toBe(0);
  });
});
