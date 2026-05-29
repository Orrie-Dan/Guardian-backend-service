import { Test, TestingModule } from '@nestjs/testing';
import { OrgMemberRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailTemplateId } from './email-template.ids';
import { EmailNotificationService } from './email-notification.service';
import { SmtpEmailService } from './smtp-email.service';

describe('EmailNotificationService', () => {
  let service: EmailNotificationService;
  const smtp = { isConfigured: jest.fn(), sendMail: jest.fn() };
  const prisma = {
    user: { findUnique: jest.fn() },
    organization: { findUnique: jest.fn() },
    organizationUser: { findMany: jest.fn() },
    guardian: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailNotificationService,
        { provide: SmtpEmailService, useValue: smtp },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(EmailNotificationService);
  });

  it('sendBestEffort skips when no recipient', async () => {
    const result = await service.sendBestEffort(
      null,
      EmailTemplateId.SECURITY_PASSWORD_SET,
      {},
    );
    expect(result).toEqual({ sent: false, skipped: true, reason: 'no_recipient' });
    expect(smtp.sendMail).not.toHaveBeenCalled();
  });

  it('sendBestEffort does not throw when SMTP fails', async () => {
    smtp.isConfigured.mockReturnValue(true);
    smtp.sendMail.mockRejectedValue(new Error('smtp down'));

    const result = await service.sendBestEffort(
      'user@example.com',
      EmailTemplateId.SECURITY_PASSWORD_SET,
      { fullName: 'Test' },
    );

    expect(result).toEqual({ sent: false, reason: 'send_failed' });
  });

  it('sendToOrgOwners emails each owner', async () => {
    smtp.isConfigured.mockReturnValue(true);
    smtp.sendMail.mockResolvedValue(undefined);
    prisma.organization.findUnique.mockResolvedValue({
      legalName: 'Acme Ltd',
      tradingName: 'Acme',
    });
    prisma.organizationUser.findMany.mockResolvedValue([
      {
        user: { id: 'u1', email: 'owner@example.com', fullName: 'Owner' },
      },
    ]);

    const results = await service.sendToOrgOwners(
      'org-1',
      EmailTemplateId.VERIFICATION_ORG_APPROVED,
      {},
    );

    expect(results).toHaveLength(1);
    expect(results[0].sent).toBe(true);
    expect(smtp.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com' }),
    );
    expect(prisma.organizationUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', role: OrgMemberRole.CLIENT_OWNER },
      }),
    );
  });
});
