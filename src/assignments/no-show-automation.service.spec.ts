import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentsService } from './assignments.service';
import { NoShowAutomationService } from './no-show-automation.service';
import { NoShowReasonCode } from './dto/no-show.dto';

describe('NoShowAutomationService', () => {
  let service: NoShowAutomationService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: Record<string, any> = {
    jobAssignment: {
      findMany: jest.fn(),
    },
  };
  const assignments = {
    autoNoShow: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NoShowAutomationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AssignmentsService, useValue: assignments },
      ],
    }).compile();

    service = module.get(NoShowAutomationService);
    jest.clearAllMocks();
  });

  it('auto-marks accepted and en-route stale assignments', async () => {
    prisma.jobAssignment.findMany.mockResolvedValue([
      { id: 'a-accepted', status: AssignmentStatus.ACCEPTED },
      { id: 'a-enroute', status: AssignmentStatus.EN_ROUTE },
    ]);

    await service.scanAndMarkNoShows();

    expect(assignments.autoNoShow).toHaveBeenNthCalledWith(
      1,
      'a-accepted',
      NoShowReasonCode.CLIENT_UNREACHABLE,
      expect.stringContaining('20m'),
    );
    expect(assignments.autoNoShow).toHaveBeenNthCalledWith(
      2,
      'a-enroute',
      NoShowReasonCode.CLIENT_NOT_PRESENT,
      expect.stringContaining('15m'),
    );
  });
});
