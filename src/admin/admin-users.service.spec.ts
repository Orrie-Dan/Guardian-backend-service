import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleCode, UserStatus } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  let service: AdminUsersService;

  const audit = { log: jest.fn() };
  const prisma = {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
    userRoleAssignment: { count: jest.fn() },
    job: { count: jest.fn() },
    guardian: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    jobAssignment: { count: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
    fieldIncident: { count: jest.fn(), deleteMany: jest.fn() },
    guardianVettingRecord: { count: jest.fn() },
    guardianShiftState: { updateMany: jest.fn() },
    refreshToken: { updateMany: jest.fn(), deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    guardianPerformanceDaily: { deleteMany: jest.fn() },
    locationHistory: { deleteMany: jest.fn() },
    certification: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const actor = {
    sub: 'admin-1',
    phone: '+250700000001',
    roles: [RoleCode.SUPER_ADMIN],
    activeRole: RoleCode.SUPER_ADMIN,
    organizationIds: [],
  };

  const baseUser = {
    id: 'user-target',
    email: 'guardian@example.com',
    phoneNumber: '+250788000099',
    fullName: 'Test Guardian',
    status: UserStatus.PENDING_VERIFICATION,
    userRoles: [{ role: { code: RoleCode.GUARDIAN } }],
    guardianProfile: { id: 'guardian-1' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(AdminUsersService);
    prisma.userRoleAssignment.count.mockResolvedValue(2);
    prisma.job.count.mockResolvedValue(0);
    prisma.guardian.findUnique.mockResolvedValue({ id: 'guardian-1' });
    prisma.jobAssignment.count.mockResolvedValue(0);
    prisma.fieldIncident.count.mockResolvedValue(0);
    prisma.guardianVettingRecord.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        guardian: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          update: jest.fn(),
          delete: jest.fn(),
        },
        guardianShiftState: { updateMany: jest.fn() },
        refreshToken: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        notification: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
        user: { update: jest.fn(), delete: jest.fn() },
        jobAssignment: {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: jest.fn(),
        },
        fieldIncident: { deleteMany: jest.fn() },
        guardianPerformanceDaily: { deleteMany: jest.fn() },
        locationHistory: { deleteMany: jest.fn() },
        certification: { deleteMany: jest.fn() },
      }),
    );
  });

  it('previewDelete returns blockers', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.job.count.mockResolvedValue(1);

    const preview = await service.previewDelete('user-target');

    expect(preview.canSoftDelete).toBe(false);
    expect(preview.blockers.some((b) => b.startsWith('ACTIVE_JOBS_CREATED'))).toBe(
      true,
    );
  });

  it('deleteUser rejects self-delete', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      id: actor.sub,
    });

    await expect(service.deleteUser(actor.sub, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deleteUser soft-deletes and audits', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);

    const result = await service.deleteUser('user-target', actor, 'soft');

    expect(result.mode).toBe('soft');
    expect(result.anonymized).toBe(true);
    expect(result.tokensRevoked).toBe(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_SOFT_DELETED' }),
    );
  });

  it('deleteUser blocks hard delete in production without flag', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevFlag = process.env.ALLOW_HARD_USER_DELETE;
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_HARD_USER_DELETE;

    prisma.user.findUnique.mockResolvedValue(baseUser);

    await expect(
      service.deleteUser('user-target', actor, 'hard'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    process.env.NODE_ENV = prevEnv;
    process.env.ALLOW_HARD_USER_DELETE = prevFlag;
  });

  it('bulkDeleteByEmail reports not_found', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await service.bulkDeleteByEmail(
      ['missing@example.com'],
      actor,
    );

    expect(result.results[0]).toEqual({
      email: 'missing@example.com',
      status: 'not_found',
    });
  });

  it('deleteUser throws when user missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.deleteUser('missing', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
