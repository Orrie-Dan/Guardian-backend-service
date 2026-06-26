import {
  AssignmentStatus,
  BillingPolicyModel,
  CertificationType,
  CertificationVerificationStatus,
  CoordinatePrecision,
  EmploymentType,
  GuardianStatus,
  GuardianVerificationStatus,
  JobType,
  OrgMemberRole,
  OrgType,
  PayPolicyModel,
  PricingModel,
  Prisma,
  PrismaClient,
  RoleCode,
  ShiftStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { seedPermissions } from '../../../prisma/seed/permissions';

export const BILLING_E2E_PASSWORD = 'TestPass123!';
export const BILLING_E2E_HOURLY_RATE = 5000;
export const BILLING_E2E_BILLABLE_HOURS = 2;

export type BillingE2eFixture = {
  organizationId: string;
  locationId: string;
  ownerUserId: string;
  ownerPhone: string;
  guardianUsers: Array<{
    userId: string;
    guardianId: string;
    phone: string;
  }>;
  pricingRuleId: string;
  cleanup: () => Promise<void>;
};

async function ensureRoles(prisma: PrismaClient) {
  const roleCodes = [
    RoleCode.CLIENT_OWNER,
    RoleCode.CLIENT_STAFF,
    RoleCode.GUARDIAN,
    RoleCode.OPS_ADMIN,
    RoleCode.SUPER_ADMIN,
  ];
  for (let i = 0; i < roleCodes.length; i += 1) {
    await prisma.role.upsert({
      where: { code: roleCodes[i] },
      create: { id: i + 1, code: roleCodes[i] },
      update: {},
    });
  }
  await seedPermissions(prisma);
}

export async function createBillingE2eFixture(
  prisma: PrismaClient,
  options: { guardianCount: number },
): Promise<BillingE2eFixture> {
  const runId = randomUUID().slice(0, 8);
  const numericSuffix = runId.replace(/\D/g, '').padStart(6, '0').slice(-6);
  const organizationId = randomUUID();
  const locationId = randomUUID();
  const ownerUserId = randomUUID();
  const pricingRuleId = randomUUID();
  const ownerPhone = `+250788${numericSuffix}`;
  const passwordHash = await bcrypt.hash(BILLING_E2E_PASSWORD, 12);

  await ensureRoles(prisma);

  await prisma.user.create({
    data: {
      id: ownerUserId,
      phoneNumber: ownerPhone,
      email: `owner-${runId}@billing-e2e.test`,
      fullName: 'Billing E2E Owner',
      status: 'ACTIVE',
      isPhoneVerified: true,
      passwordHash,
      passwordSetAt: new Date(),
      onboardingCompletedAt: new Date(),
      onboardingStep: 'SUBMITTED',
      userRoles: {
        create: {
          role: { connect: { code: RoleCode.CLIENT_OWNER } },
        },
      },
    },
  });

  await prisma.organization.create({
    data: {
      id: organizationId,
      legalName: `Billing E2E Org ${runId}`,
      tinNumber: `TIN${runId}`,
      orgType: OrgType.HOTEL,
      mobileMoneyProvider: 'MOMO_MTN',
      mobileMoneyPhone: ownerPhone,
      verificationStatus: 'VERIFIED',
    },
  });

  await prisma.organizationUser.create({
    data: {
      organizationId,
      userId: ownerUserId,
      role: OrgMemberRole.CLIENT_OWNER,
    },
  });

  await prisma.location.create({
    data: {
      id: locationId,
      organizationId,
      name: 'Billing E2E Site',
      district: 'Gasabo',
      latitude: new Prisma.Decimal(-1.9441),
      longitude: new Prisma.Decimal(30.0619),
      isPrimary: true,
      coordinatePrecision: CoordinatePrecision.USER_PINNED,
      siteSetupCompletedAt: new Date(),
    },
  });

  const billingPolicyId = randomUUID();
  const payPolicyId = randomUUID();

  await prisma.billingPolicy.create({
    data: {
      id: billingPolicyId,
      priority: 200,
      model: BillingPolicyModel.MINIMUM_GUARANTEED,
      minimumHours: new Prisma.Decimal(BILLING_E2E_BILLABLE_HOURS),
      organizationId,
      jobType: JobType.STANDARD_GUARDIAN,
      validFrom: new Date('2020-01-01'),
    },
  });

  await prisma.payPolicy.create({
    data: {
      id: payPolicyId,
      priority: 200,
      model: PayPolicyModel.MINIMUM_GUARANTEED,
      minimumHours: new Prisma.Decimal(1),
      jobType: JobType.STANDARD_GUARDIAN,
      validFrom: new Date('2020-01-01'),
    },
  });

  await prisma.pricingRule.create({
    data: {
      id: pricingRuleId,
      priority: 200,
      organizationId,
      district: 'Gasabo',
      jobType: JobType.STANDARD_GUARDIAN,
      pricingModel: PricingModel.HOURLY,
      hourlyRate: new Prisma.Decimal(BILLING_E2E_HOURLY_RATE),
      currency: 'RWF',
      validFrom: new Date('2020-01-01'),
    },
  });

  await prisma.service.upsert({
    where: { code: JobType.STANDARD_GUARDIAN },
    create: {
      code: JobType.STANDARD_GUARDIAN,
      name: 'Standard Guardian',
      hourlyRate: new Prisma.Decimal(BILLING_E2E_HOURLY_RATE),
      isActive: true,
      requiresLicense: false,
      sortOrder: 1,
    },
    update: {
      hourlyRate: new Prisma.Decimal(BILLING_E2E_HOURLY_RATE),
      isActive: true,
    },
  });

  await prisma.bookingSettings.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    create: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
  });

  const guardianUsers: BillingE2eFixture['guardianUsers'] = [];

  for (let i = 0; i < options.guardianCount; i += 1) {
    const userId = randomUUID();
    const guardianId = randomUUID();
    const phone = `+250787${(Number(numericSuffix) + i + 1).toString().padStart(6, '0')}`;

    await prisma.user.create({
      data: {
        id: userId,
        phoneNumber: phone,
        fullName: `Billing Guardian ${runId}-${i}`,
        status: 'ACTIVE',
        isPhoneVerified: true,
        passwordHash,
        passwordSetAt: new Date(),
        userRoles: {
          create: {
            role: { connect: { code: RoleCode.GUARDIAN } },
          },
        },
      },
    });

    await prisma.guardian.create({
      data: {
        id: guardianId,
        userId,
        guardianCode: `BE${runId}${i}`.slice(0, 20),
        nationalIdHash: `hash-${runId}-${i}`,
        verificationStatus: GuardianVerificationStatus.VERIFIED,
        employmentType: EmploymentType.PART_TIME,
        status: GuardianStatus.ACTIVE,
        districtBase: 'Gasabo',
        hourlyPayRate: new Prisma.Decimal(3000),
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

    guardianUsers.push({ userId, guardianId, phone });
  }

  const cleanup = async () => {
    const guardianIds = guardianUsers.map((g) => g.guardianId);
    const userIds = [ownerUserId, ...guardianUsers.map((g) => g.userId)];
    const jobs = await prisma.job.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const jobIds = jobs.map((j) => j.id);

    await prisma.guardianEarning.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.invoice.deleteMany({ where: { organizationId } });
    await prisma.jobAssignment.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobStatusHistory.deleteMany({ where: { jobId: { in: jobIds } } });
    if (jobIds.length) {
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: jobIds } },
      });
    }
    await prisma.job.deleteMany({ where: { organizationId } });
    await prisma.pricingRule.deleteMany({ where: { id: pricingRuleId } });
    await prisma.billingPolicy.deleteMany({ where: { id: billingPolicyId } });
    await prisma.payPolicy.deleteMany({ where: { id: payPolicyId } });
    await prisma.certification.deleteMany({
      where: { guardianId: { in: guardianIds } },
    });
    await prisma.guardianShiftState.deleteMany({
      where: { guardianId: { in: guardianIds } },
    });
    await prisma.guardian.deleteMany({ where: { id: { in: guardianIds } } });
    await prisma.location.deleteMany({ where: { organizationId } });
    await prisma.organizationUser.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.notification.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.userRoleAssignment.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  };

  return {
    organizationId,
    locationId,
    ownerUserId,
    ownerPhone,
    guardianUsers,
    pricingRuleId,
    cleanup,
  };
}

export async function createOffersForJob(
  prisma: PrismaClient,
  jobId: string,
  guardianIds: string[],
) {
  const offers: Array<{ id: string; guardianId: string }> = [];
  for (let i = 0; i < guardianIds.length; i += 1) {
    const id = randomUUID();
    await prisma.jobAssignment.create({
      data: {
        id,
        jobId,
        guardianId: guardianIds[i],
        assignmentRound: i + 1,
        status: AssignmentStatus.OFFERED,
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    offers.push({ id, guardianId: guardianIds[i] });
  }
  return offers;
}

export function expectedBillingSubtotal(guardians: number): number {
  return BILLING_E2E_HOURLY_RATE * BILLING_E2E_BILLABLE_HOURS * guardians;
}
