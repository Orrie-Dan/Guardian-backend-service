import {
  AssignmentStatus,
  CertificationType,
  CertificationVerificationStatus,
  EmploymentType,
  GuardianStatus,
  GuardianVerificationStatus,
  JobPriority,
  JobStatus,
  JobType,
  OrgMemberRole,
  OrgType,
  Prisma,
  PrismaClient,
  ShiftStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';

export type MultiGuardianFixture = {
  jobId: string;
  organizationId: string;
  locationId: string;
  assignments: Array<{ id: string; guardianId: string }>;
  guardianIds: string[];
  cleanup: () => Promise<void>;
};

export async function createMultiGuardianJobFixture(
  prisma: PrismaClient,
  options: { requestedGuardianCount: number; offerCount: number },
): Promise<MultiGuardianFixture> {
  const runId = randomUUID().slice(0, 8);
  const organizationId = randomUUID();
  const locationId = randomUUID();
  const creatorId = randomUUID();
  const jobId = randomUUID();

  await prisma.user.create({
    data: {
      id: creatorId,
      phoneNumber: `+2507889${runId.slice(0, 6)}`,
      fullName: 'Integration Test Owner',
      status: 'ACTIVE',
    },
  });

  await prisma.organization.create({
    data: {
      id: organizationId,
      legalName: `Integration Org ${runId}`,
      tinNumber: `TIN${runId}`,
      orgType: OrgType.HOTEL,
      mobileMoneyProvider: 'MOMO_MTN',
      mobileMoneyPhone: `+2507889${runId.slice(0, 6)}`,
      verificationStatus: 'VERIFIED',
    },
  });

  await prisma.organizationUser.create({
    data: {
      organizationId,
      userId: creatorId,
      role: OrgMemberRole.CLIENT_OWNER,
    },
  });

  await prisma.location.create({
    data: {
      id: locationId,
      organizationId,
      name: 'Integration Site',
      district: 'gasabo',
      latitude: new Prisma.Decimal(-1.9441),
      longitude: new Prisma.Decimal(30.0619),
    },
  });

  await prisma.job.create({
    data: {
      id: jobId,
      referenceNumber: `INT${runId}`.slice(0, 20),
      organizationId,
      locationId,
      createdBy: creatorId,
      jobType: JobType.STANDARD_GUARDIAN,
      priority: JobPriority.STANDARD,
      status: JobStatus.DISPATCHING,
      requestedGuardianCount: options.requestedGuardianCount,
      scheduledStart: new Date(Date.now() + 3_600_000),
      scheduledEnd: new Date(Date.now() + 7_200_000),
      billingPolicyModel: 'MINIMUM_GUARANTEED',
      billingMinimumHours: new Prisma.Decimal(1),
      billingPolicyResolvedAt: new Date(),
      billingAllowEarlyRelease: false,
      billingProrationEnabled: false,
      billingEarlyReleaseRequiresClientApproval: true,
    },
  });

  const assignments: Array<{ id: string; guardianId: string }> = [];
  const guardianIds: string[] = [];

  for (let i = 0; i < options.offerCount; i += 1) {
    const userId = randomUUID();
    const guardianId = randomUUID();
    const assignmentId = randomUUID();
    guardianIds.push(guardianId);

    await prisma.user.create({
      data: {
        id: userId,
        phoneNumber: `+2507${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        fullName: `Guardian ${runId}-${i}`,
        status: 'ACTIVE',
      },
    });

    await prisma.guardian.create({
      data: {
        id: guardianId,
        userId,
        guardianCode: `G${runId}${i}`.slice(0, 20),
        nationalIdHash: `hash-${runId}-${i}`,
        verificationStatus: GuardianVerificationStatus.VERIFIED,
        employmentType: EmploymentType.PART_TIME,
        status: GuardianStatus.ACTIVE,
        districtBase: 'gasabo',
        hourlyPayRate: new Prisma.Decimal(5000),
        shiftState: {
          create: {
            shiftStatus: ShiftStatus.AVAILABLE,
            availableForJobs: true,
          },
        },
        certifications: {
          create: {
            certificationType: CertificationType.RNP_SECURITY_LICENSE,
            issuer: 'RNP',
            issueDate: new Date('2024-01-01'),
            verificationStatus: CertificationVerificationStatus.VERIFIED,
          },
        },
      },
    });

    await prisma.jobAssignment.create({
      data: {
        id: assignmentId,
        jobId,
        guardianId,
        assignmentRound: i + 1,
        status: AssignmentStatus.OFFERED,
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    assignments.push({ id: assignmentId, guardianId });
  }

  const cleanup = async () => {
    const guardianUsers = await prisma.guardian.findMany({
      where: { id: { in: guardianIds } },
      select: { userId: true },
    });
    const userIds = [creatorId, ...guardianUsers.map((g) => g.userId)];

    await prisma.jobAssignment.deleteMany({ where: { jobId } });
    await prisma.jobStatusHistory.deleteMany({ where: { jobId } });
    await prisma.job.deleteMany({ where: { id: jobId } });
    await prisma.certification.deleteMany({
      where: { guardianId: { in: guardianIds } },
    });
    await prisma.guardianShiftState.deleteMany({
      where: { guardianId: { in: guardianIds } },
    });
    await prisma.guardian.deleteMany({ where: { id: { in: guardianIds } } });
    await prisma.location.deleteMany({ where: { id: locationId } });
    await prisma.organizationUser.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  };

  return { jobId, organizationId, locationId, assignments, guardianIds, cleanup };
}
