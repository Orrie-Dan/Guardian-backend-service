import {
  CertificationVerificationStatus,
  CertificationType,
  GuardianVerificationStatus,
  JobType,
  OrgMemberRole,
  OrgType,
  PricingModel,
  PrismaClient,
  RoleCode,
  ShiftStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedPermissions } from './seed/permissions';

const prisma = new PrismaClient();

async function main() {
  const roles = await Promise.all(
    (
      [
        RoleCode.SUPER_ADMIN,
        RoleCode.OPS_ADMIN,
        RoleCode.CLIENT_OWNER,
        RoleCode.CLIENT_STAFF,
        RoleCode.GUARDIAN,
      ] as const
    ).map(async (code, index) =>
      prisma.role.upsert({
        where: { code },
        create: { id: index + 1, code },
        update: {},
      }),
    ),
  );

  const roleByCode = Object.fromEntries(roles.map((r) => [r.code, r])) as Record<
    RoleCode,
    (typeof roles)[0]
  >;

  await seedPermissions(prisma);

  const devPasswordHash = await bcrypt.hash('TestPass123!', 12);

  const owner = await prisma.user.upsert({
    where: { phoneNumber: '+250788000001' },
    create: {
      phoneNumber: '+250788000001',
      email: 'owner@test.g2sentry.local',
      fullName: 'Seed Client Owner',
      isPhoneVerified: true,
      status: 'ACTIVE',
      passwordHash: devPasswordHash,
      passwordSetAt: new Date(),
      onboardingCompletedAt: new Date(),
      onboardingStep: 'SUBMITTED',
    },
    update: {
      fullName: 'Seed Client Owner',
      passwordHash: devPasswordHash,
      passwordSetAt: new Date(),
      onboardingCompletedAt: new Date(),
      onboardingStep: 'SUBMITTED',
    },
  });

  const guardianUser = await prisma.user.upsert({
    where: { phoneNumber: '+250788000002' },
    create: {
      phoneNumber: '+250788000002',
      fullName: 'Seed Guardian',
      isPhoneVerified: true,
      status: 'ACTIVE',
      passwordHash: devPasswordHash,
      passwordSetAt: new Date(),
    },
    update: {
      fullName: 'Seed Guardian',
      passwordHash: devPasswordHash,
      passwordSetAt: new Date(),
    },
  });

  await prisma.userRoleAssignment.upsert({
    where: {
      userId_roleId: {
        userId: owner.id,
        roleId: roleByCode[RoleCode.CLIENT_OWNER].id,
      },
    },
    create: {
      userId: owner.id,
      roleId: roleByCode[RoleCode.CLIENT_OWNER].id,
    },
    update: {},
  });

  await prisma.userRoleAssignment.upsert({
    where: {
      userId_roleId: {
        userId: guardianUser.id,
        roleId: roleByCode[RoleCode.GUARDIAN].id,
      },
    },
    create: {
      userId: guardianUser.id,
      roleId: roleByCode[RoleCode.GUARDIAN].id,
    },
    update: {},
  });

  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      legalName: 'Kigali Heights Security Ltd',
      tradingName: 'Kigali Heights',
      tinNumber: '123456789',
      orgType: OrgType.HOTEL,
      mobileMoneyProvider: 'MOMO_MTN',
      mobileMoneyPhone: '+250788000001',
      verificationStatus: 'VERIFIED',
      applicationSubmittedAt: new Date(),
    },
    update: {
      mobileMoneyProvider: 'MOMO_MTN',
      mobileMoneyPhone: '+250788000001',
      tinNumber: '123456789',
      applicationSubmittedAt: new Date(),
    },
  });

  await prisma.organizationUser.upsert({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: owner.id,
      },
    },
    create: {
      organizationId: org.id,
      userId: owner.id,
      role: OrgMemberRole.CLIENT_OWNER,
    },
    update: {},
  });

  const loc1 = await prisma.location.upsert({
    where: { id: '00000000-0000-4000-8000-000000000010' },
    create: {
      id: '00000000-0000-4000-8000-000000000010',
      organizationId: org.id,
      name: 'Kigali Heights Main',
      district: 'Gasabo',
      address: 'KN 4 Ave, Kigali',
      latitude: -1.9441,
      longitude: 30.0619,
      isPrimary: true,
      coordinatePrecision: 'USER_PINNED',
      siteSetupCompletedAt: new Date(),
    },
    update: {
      isPrimary: true,
      coordinatePrecision: 'USER_PINNED',
      siteSetupCompletedAt: new Date(),
      address: 'KN 4 Ave, Kigali',
    },
  });

  await prisma.location.upsert({
    where: { id: '00000000-0000-4000-8000-000000000011' },
    create: {
      id: '00000000-0000-4000-8000-000000000011',
      organizationId: org.id,
      name: 'Convention Centre Branch',
      district: 'Gasabo',
      latitude: -1.9536,
      longitude: 30.0925,
    },
    update: {},
  });

  const nationalIdHash = await bcrypt.hash('seed-national-id', 12);

  const guardian = await prisma.guardian.upsert({
    where: { userId: guardianUser.id },
    create: {
      userId: guardianUser.id,
      guardianCode: 'G-00001',
      nationalIdHash,
      districtBase: 'Gasabo',
      coverageDistricts: ['Gasabo'],
      verificationStatus: GuardianVerificationStatus.VERIFIED,
      status: 'ACTIVE',
      activatedAt: new Date(),
      shiftState: {
        create: {
          shiftStatus: ShiftStatus.AVAILABLE,
          availableForJobs: true,
        },
      },
    },
    update: {
      verificationStatus: GuardianVerificationStatus.VERIFIED,
      status: 'ACTIVE',
      activatedAt: new Date(),
    },
    include: { shiftState: true },
  });

  await prisma.certification.upsert({
    where: { id: '00000000-0000-4000-8000-000000000200' },
    create: {
      id: '00000000-0000-4000-8000-000000000200',
      guardianId: guardian.id,
      certificationType: CertificationType.RNP_SECURITY_LICENSE,
      issuer: 'RNP Seed',
      issueDate: new Date('2024-01-01'),
      expiryDate: new Date('2027-01-01'),
      verificationStatus: CertificationVerificationStatus.VERIFIED,
    },
    update: {
      verificationStatus: CertificationVerificationStatus.VERIFIED,
    },
  });

  if (!guardian.shiftState) {
    await prisma.guardianShiftState.create({
      data: {
        guardianId: guardian.id,
        shiftStatus: ShiftStatus.AVAILABLE,
        availableForJobs: true,
      },
    });
  }

  await prisma.pricingRule.upsert({
    where: { id: '00000000-0000-4000-8000-000000000100' },
    create: {
      id: '00000000-0000-4000-8000-000000000100',
      priority: 1,
      pricingModel: PricingModel.HOURLY,
      hourlyRate: 5000,
      jobType: null,
      organizationId: null,
      district: null,
    },
    update: {},
  });

  await prisma.pricingRule.upsert({
    where: { id: '00000000-0000-4000-8000-000000000101' },
    create: {
      id: '00000000-0000-4000-8000-000000000101',
      priority: 50,
      organizationId: org.id,
      district: loc1.district,
      jobType: JobType.PATROL,
      pricingModel: PricingModel.HOURLY,
      hourlyRate: 7500,
    },
    update: {},
  });

  console.log('Seed complete:', {
    orgId: org.id,
    ownerId: owner.id,
    guardianId: guardian.id,
    locationId: loc1.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
