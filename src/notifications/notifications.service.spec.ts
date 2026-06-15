import { Test, TestingModule } from '@nestjs/testing';
import { OrgMemberRole, RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const prisma = {
    notification: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    organizationUser: { findMany: jest.fn() },
    guardian: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(NotificationsService);
    jest.clearAllMocks();
    prisma.notification.create.mockResolvedValue({ id: 'n-1' });
  });

  it('notifyUserInApp skips when user not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const count = await service.notifyUserInApp('missing', 'Title', 'Body');

    expect(count).toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('notifyUserInApp creates notification', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u-1' });

    const count = await service.notifyUserInApp('u-1', 'Title', 'Body', {
      action: 'VIEW_JOB',
    });

    expect(count).toBe(1);
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u-1',
          title: 'Title',
          body: 'Body',
          payload: { action: 'VIEW_JOB' },
        }),
      }),
    );
  });

  it('notifyOrgOwnersInApp fans out to owners', async () => {
    prisma.organizationUser.findMany.mockResolvedValue([
      { userId: 'owner-1' },
      { userId: 'owner-2' },
    ]);

    const count = await service.notifyOrgOwnersInApp(
      'org-1',
      'Job created',
      'REF-001',
      { jobId: 'j-1' },
    );

    expect(count).toBe(2);
    expect(prisma.organizationUser.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', role: OrgMemberRole.CLIENT_OWNER },
      select: { userId: true },
    });
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
  });

  it('notifyOpsAdminsInApp fans out to ops users', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'ops-1' }, { id: 'ops-2' }]);

    const count = await service.notifyOpsAdminsInApp('Replacement requested', 'Reason');

    expect(count).toBe(2);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        userRoles: {
          some: {
            role: { code: { in: [RoleCode.OPS_ADMIN, RoleCode.SUPER_ADMIN] } },
          },
        },
      },
      select: { id: true },
    });
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
  });

  it('notifyGuardianInApp skips when guardian not found', async () => {
    prisma.guardian.findUnique.mockResolvedValue(null);

    const count = await service.notifyGuardianInApp('g-missing', 'Title', 'Body');

    expect(count).toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('notifyGuardianInApp creates notification for guardian user', async () => {
    prisma.guardian.findUnique.mockResolvedValue({ userId: 'u-guardian' });

    const count = await service.notifyGuardianInApp('g-1', 'New offer', 'Job REF-1');

    expect(count).toBe(1);
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u-guardian' }),
      }),
    );
  });
});
