import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CertificationVerificationStatus } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuardiansService } from './admin-guardians.service';
import { AdminVerificationService } from './admin-verification.service';
import { PasswordService } from '../auth/password.service';
import { OtpService } from '../auth/otp.service';
import { CredentialDeliveryService } from '../notifications/credential-delivery.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('Admin certification reads', () => {
  const prisma = {
    guardian: { findUnique: jest.fn() },
    certification: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
  };

  describe('AdminGuardiansService', () => {
    let guardians: AdminGuardiansService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AdminGuardiansService,
          { provide: PrismaService, useValue: prisma },
          { provide: AuditService, useValue: { log: jest.fn() } },
          { provide: OtpService, useValue: {} },
          { provide: PasswordService, useValue: {} },
          { provide: CredentialDeliveryService, useValue: {} },
          { provide: EmailNotificationService, useValue: {} },
        ],
      }).compile();
      guardians = module.get(AdminGuardiansService);
      jest.clearAllMocks();
    });

    it('listCertificationsForGuardian returns mapped rows', async () => {
      prisma.guardian.findUnique.mockResolvedValue({ id: 'g-1' });
      prisma.certification.findMany.mockResolvedValue([
        {
          id: 'c-1',
          guardianId: 'g-1',
          verificationStatus: CertificationVerificationStatus.PENDING,
          document: null,
        },
      ]);

      const rows = await guardians.listCertificationsForGuardian('g-1');
      expect(rows).toHaveLength(1);
      expect(rows[0].document).toBeNull();
    });

    it('getCertificationById throws when missing', async () => {
      prisma.certification.findUnique.mockResolvedValue(null);
      await expect(guardians.getCertificationById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('AdminVerificationService', () => {
    let verification: AdminVerificationService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AdminVerificationService,
          { provide: PrismaService, useValue: prisma },
          { provide: AuditService, useValue: { log: jest.fn() } },
          { provide: NotificationsService, useValue: {} },
          { provide: EmailNotificationService, useValue: {} },
        ],
      }).compile();
      verification = module.get(AdminVerificationService);
      jest.clearAllMocks();
    });

    it('listCertifications defaults to PENDING', async () => {
      prisma.certification.findMany.mockResolvedValue([]);
      prisma.certification.count.mockResolvedValue(0);

      await verification.listCertifications({ page: 1, limit: 20, order: 'desc' });

      expect(prisma.certification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { verificationStatus: CertificationVerificationStatus.PENDING },
        }),
      );
    });
  });
});
