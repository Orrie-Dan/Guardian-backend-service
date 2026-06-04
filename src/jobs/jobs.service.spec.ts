import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentStatus, JobStatus, RoleCode } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { OrganizationVerificationPolicy } from '../common/policies/organization-verification.policy';
import { PrimaryLocationSetupPolicy } from '../common/policies/primary-location-setup.policy';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { DispatchingService } from '../dispatching/dispatching.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { BillingCalculationService } from '../billing/billing-calculation.service';
import { GuardianLocationService } from '../guardians/guardian-location.service';
import { JobReferenceService } from './job-reference.service';
import { InvoiceViewService } from '../billing/invoice-view.service';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let service: JobsService;
  const prisma = {
    location: { findFirst: jest.fn() },
    job: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const policy = {
    assertOrgMember: jest.fn(),
    assertJobAccess: jest.fn(),
    isOps: jest.fn().mockReturnValue(false),
  };
  const orgVerification = {
    assertOrgVerifiedForMutations: jest.fn(),
  };
  const locationSetup = {
    assertCanBookJobs: jest.fn(),
  };
  const guardianLocation = {
    getCurrent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: PrismaService, useValue: prisma },
        { provide: JobReferenceService, useValue: { nextReference: jest.fn() } },
        { provide: OutboxService, useValue: { enqueueInTransaction: jest.fn() } },
        { provide: ResourceOwnerPolicy, useValue: policy },
        { provide: OrganizationVerificationPolicy, useValue: orgVerification },
        { provide: PrimaryLocationSetupPolicy, useValue: locationSetup },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: DispatchingService, useValue: { requestDispatch: jest.fn() } },
        {
          provide: EmailNotificationService,
          useValue: { sendToOrgOwners: jest.fn() },
        },
        { provide: GuardianLocationService, useValue: guardianLocation },
        {
          provide: BillingCalculationService,
          useValue: {
            resolveBillingPolicy: jest.fn().mockResolvedValue({
              model: 'MINIMUM_GUARANTEED',
              minimumHours: 2,
            }),
          },
        },
        {
          provide: InvoiceViewService,
          useValue: { applyPendingConfirmationOnView: jest.fn((inv) => inv) },
        },
      ],
    }).compile();

    service = module.get(JobsService);
    jest.clearAllMocks();
  });

  it('create blocks unverified organization for clients', async () => {
    policy.assertOrgMember.mockResolvedValue(undefined);
    locationSetup.assertCanBookJobs.mockRejectedValue(
      new ForbiddenException({
        code: 'PRIMARY_LOCATION_SETUP_REQUIRED',
        message: 'Complete your site on the map before booking.',
      }),
    );

    const actor = {
      sub: 'u1',
      roles: [RoleCode.CLIENT_OWNER],
      organizationIds: ['org-1'],
      activeOrgId: 'org-1',
    } as never;

    await expect(
      service.create(
        {
          organizationId: 'org-1',
          locationId: 'loc-1',
          jobType: 'PATROL',
          scheduledStart: '2025-06-01T10:00:00Z',
          scheduledEnd: '2025-06-01T18:00:00Z',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(locationSetup.assertCanBookJobs).toHaveBeenCalledWith('org-1');
  });

  it('list includes location and organization', async () => {
    policy.assertOrgMember.mockResolvedValue(undefined);
    prisma.job.findMany.mockResolvedValue([]);
    prisma.job.count.mockResolvedValue(0);

    const actor = {
      sub: 'u1',
      roles: [RoleCode.CLIENT_OWNER],
      organizationIds: ['org-1'],
      activeOrgId: 'org-1',
    } as never;

    await service.list({ page: 1, limit: 20 } as never, actor);

    expect(prisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { location: true, organization: true },
      }),
    );
  });

  it('findOne includes location and organization', async () => {
    policy.assertJobAccess.mockResolvedValue({ id: 'job-1' });
    prisma.job.findUnique.mockResolvedValue({ id: 'job-1' });

    const actor = {
      sub: 'u1',
      roles: [RoleCode.CLIENT_OWNER],
      activeOrgId: 'org-1',
    } as never;

    await service.findOne('job-1', actor);

    expect(prisma.job.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          location: true,
          organization: true,
        }),
      }),
    );
  });

  it('getTracking rejects when no active assignment', async () => {
    policy.assertJobAccess.mockResolvedValue({ id: 'job-1' });
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.PENDING,
      location: {
        id: 'loc-1',
        name: 'Site',
        address: null,
        latitude: new Prisma.Decimal('-1.95'),
        longitude: new Prisma.Decimal('30.06'),
      },
      assignments: [],
    });

    const actor = {
      sub: 'u1',
      roles: [RoleCode.CLIENT_OWNER],
      activeOrgId: 'org-1',
    } as never;

    await expect(service.getTracking('job-1', actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('getTracking returns location, destination, and eta', async () => {
    policy.assertJobAccess.mockResolvedValue({ id: 'job-1' });
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.ASSIGNED,
      location: {
        id: 'loc-1',
        name: 'Site A',
        address: 'Main St',
        latitude: new Prisma.Decimal('-1.95'),
        longitude: new Prisma.Decimal('30.06'),
      },
      assignments: [
        {
          id: 'asgn-1',
          guardianId: 'g-1',
          status: AssignmentStatus.EN_ROUTE,
          acceptedAt: new Date('2025-06-01T10:00:00Z'),
          arrivedAt: null,
          guardian: {
            user: { fullName: 'Jean Guard', phoneNumber: '+250700000001' },
          },
        },
      ],
    });
    guardianLocation.getCurrent.mockResolvedValue({
      guardianId: 'g-1',
      latitude: '-1.94',
      longitude: '30.06',
      speed: '8',
      batteryLevel: 90,
      recordedAt: '2025-06-01T10:05:00.000Z',
      source: 'presence',
      connected: true,
      reachable: true,
    });

    const actor = {
      sub: 'u1',
      roles: [RoleCode.CLIENT_OWNER],
      activeOrgId: 'org-1',
    } as never;

    const result = await service.getTracking('job-1', actor);

    expect(result.guardian.displayName).toBe('Jean Guard');
    expect(result.assignment.status).toBe(AssignmentStatus.EN_ROUTE);
    expect(result.destination.name).toBe('Site A');
    expect(result.distanceMeters).toBeGreaterThan(0);
    expect(result.etaMinutes).toBeGreaterThanOrEqual(1);
    expect(guardianLocation.getCurrent).toHaveBeenCalledWith('g-1');
  });
});
