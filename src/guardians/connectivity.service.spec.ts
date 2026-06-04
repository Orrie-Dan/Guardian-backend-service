import { Test, TestingModule } from '@nestjs/testing';
import { ConnectivityService } from './connectivity.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { PresenceService } from '../redis/presence.service';
import { ShiftStateService } from './shift-state.service';
import { QueueService } from '../queue/queue.service';

describe('ConnectivityService', () => {
  let service: ConnectivityService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: Record<string, any> = {
    guardian: { findUnique: jest.fn() },
    locationHistory: { create: jest.fn() },
    jobAssignment: { findFirst: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const presence = {
    setPresence: jest.fn(),
    isReachable: jest.fn(),
  };
  const shiftState = { setAvailable: jest.fn() };
  const queue = { enqueueConnectivityCheck: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectivityService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: PresenceService, useValue: presence },
        { provide: ShiftStateService, useValue: shiftState },
        { provide: QueueService, useValue: queue },
      ],
    }).compile();

    service = module.get(ConnectivityService);
    jest.clearAllMocks();
  });

  it('returns reachability from presence after heartbeat', async () => {
    prisma.guardian.findUnique.mockResolvedValue({
      id: 'g-1',
      shiftState: { availableForJobs: true, shiftStatus: 'AVAILABLE' },
    });
    presence.isReachable.mockResolvedValue(false);

    const result = await service.recordHeartbeat('g-1', -1.95, 30.06, 0, 80);

    expect(presence.setPresence).toHaveBeenCalled();
    expect(queue.enqueueConnectivityCheck).toHaveBeenCalledWith('g-1');
    expect(result.reachable).toBe(false);
  });
});
