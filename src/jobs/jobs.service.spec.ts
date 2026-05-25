import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleCode, VerificationStatus } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { OrganizationVerificationPolicy } from '../common/policies/organization-verification.policy';
import { PrimaryLocationSetupPolicy } from '../common/policies/primary-location-setup.policy';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { DispatchingService } from '../dispatching/dispatching.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { JobReferenceService } from './job-reference.service';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let service: JobsService;
  const prisma = {
    location: { findFirst: jest.fn() },
  };
  const policy = {
    assertOrgMember: jest.fn(),
    isOps: jest.fn().mockReturnValue(false),
  };
  const orgVerification = {
    assertOrgVerifiedForMutations: jest.fn(),
  };
  const locationSetup = {
    assertCanBookJobs: jest.fn(),
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
});
