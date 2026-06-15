import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleCode } from '@prisma/client';
import { OtpService } from '../auth/otp.service';
import { PasswordService } from '../auth/password.service';
import { AuditService } from '../common/services/audit.service';
import { CredentialDeliveryService } from '../notifications/credential-delivery.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuardiansService } from './admin-guardians.service';

describe('AdminGuardiansService', () => {
  let service: AdminGuardiansService;
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn() },
    role: { findUnique: jest.fn() },
    guardian: { count: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const otp = { requestOtp: jest.fn() };
  const passwords = { hash: jest.fn() };
  const credentials = { sendGuardianCredentials: jest.fn() };
  const emails = { sendToUser: jest.fn().mockResolvedValue({ sent: true }) };
  const notifications = { notifyUserInApp: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGuardiansService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OtpService, useValue: otp },
        { provide: PasswordService, useValue: passwords },
        { provide: CredentialDeliveryService, useValue: credentials },
        { provide: EmailNotificationService, useValue: emails },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(AdminGuardiansService);
    jest.clearAllMocks();
  });

  it('create rejects duplicate phone', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.create(
        {
          phone: '+250788000099',
          fullName: 'Test',
          nationalId: '1199080012345678',
          districtBase: 'Gasabo',
        },
        { sub: 'admin-1', roles: [RoleCode.OPS_ADMIN] } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create stores temp password hash and dispatches credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue({ id: 'role-guardian' });
    prisma.guardian.count.mockResolvedValue(12);
    passwords.hash.mockResolvedValue('hashed-temp-password');
    const created = {
      id: 'user-1',
      guardianProfile: { id: 'guardian-1', userId: 'user-1' },
    };
    prisma.$transaction.mockImplementation(async (handler: any) =>
      handler({
        user: { create: jest.fn().mockResolvedValue(created) },
      }),
    );
    credentials.sendGuardianCredentials.mockResolvedValue({
      dispatched: true,
      channel: 'EMAIL',
    });

    const result = await service.create(
      {
        phone: '+250788000099',
        fullName: 'Test',
        email: 'guardian@example.com',
        nationalId: '1199080012345678',
        districtBase: 'Gasabo',
      },
      { sub: 'admin-1', roles: [RoleCode.OPS_ADMIN] } as never,
    );

    expect(passwords.hash).toHaveBeenCalled();
    expect(credentials.sendGuardianCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Test',
        phoneNumber: '+250788000099',
        email: 'guardian@example.com',
      }),
    );
    expect(result).toMatchObject({
      id: 'guardian-1',
      credentialsDispatched: true,
      credentialsChannel: 'EMAIL',
    });
  });
});
